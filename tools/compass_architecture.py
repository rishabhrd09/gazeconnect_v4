"""Proposed architectural detail for Compass previews, shared by every output.

Grid rectangles remain the dimension reference. Walls (9 in exterior / 6 in
internal), windows, furniture and stair arrangement are illustrative proposals,
not surveyed construction information. Nothing is written back to the map.
"""
from __future__ import annotations
import math
from itertools import combinations, islice, product
from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

OUTDOOR = ('lawn', 'garden', 'porch', 'verandah', 'backyard', 'balcony', 'terrace', 'open area')
ARCHITECTURE_NOTE = ('Architectural preview: 9-inch outer and 6-inch inner walls; windows, furniture and stair arrangement are proposed. Room dimensions follow the grid boundaries. Verify site setbacks and construction details with your designer.')


def is_outdoor(room):
    name = (room['roomId'] + ' ' + room['room']).lower()
    return any(word in name for word in OUTDOOR)


def parts(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, 'geoms') else [geom]


def segments(geom):
    for part in parts(geom):
        if part.geom_type == 'LineString':
            points = list(part.coords)
            yield from zip(points, points[1:])


def rect_points(r):
    x1,y1,x2,y2 = r
    return [(x1,y1),(x2,y1),(x2,y2),(x1,y2)]


def ellipse(x,y,rx,ry):
    return [(x+rx*math.cos(i*math.tau/32), y+ry*math.sin(i*math.tau/32)) for i in range(32)]


def details(m):
    rooms = m['rooms']
    for room in rooms:
        room['outdoor'] = is_outdoor(room)
        room['shape'] = unary_union(room['polygons'])
    building = unary_union([r['shape'] for r in rooms if not r['outdoor']])
    boundaries = unary_union([r['shape'].boundary for r in rooms if not r['outdoor']])
    walls = []
    for a,b in segments(boundaries):
        segment = LineString([a,b])
        mid = segment.interpolate(.5, normalized=True)
        external = building.boundary.distance(mid) < .001
        walls.append({'a':a,'b':b,'exterior':external,'thickness':.75 if external else .5})
    doors = []
    for raw in m['doors']:
        a,b=(raw['x1'],raw['y1']),(raw['x2'],raw['y2'])
        length = math.dist(a,b)
        if length < .01: continue
        dx,dy=(b[0]-a[0])/length,(b[1]-a[1])/length
        n=(-dy,dx)
        room = next((r for r in rooms if r['placementId']==raw['toPlacementId']), None)
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        if room and not room['shape'].covers(Point(mid[0]+n[0]*.1,mid[1]+n[1]*.1)):
            n=(-n[0],-n[1])
        end=(a[0]+n[0]*length,a[1]+n[1]*length)
        start_angle=math.atan2(dy,dx)
        direction=1 if dx*n[1]-dy*n[0]>0 else -1
        arc=[(a[0]+length*math.cos(start_angle+direction*i*math.pi/48), a[1]+length*math.sin(start_angle+direction*i*math.pi/48)) for i in range(25)]
        doors.append({**raw,'a':a,'b':b,'leaf':end,'arc':arc,'normal':n})
    # Windows only face the plot perimeter or explicitly placed outdoor space.
    # Unfilled cells are not silently treated as gardens or light wells.
    outdoors=unary_union([r['shape'] for r in rooms if r['outdoor']])
    site=box(0,0,m['width'],m['depth'])
    windows=[]
    for room in rooms:
        if room['outdoor']: continue
        for a,b in segments(room['shape'].boundary):
            edge=LineString([a,b]); length=edge.length
            if length<5: continue
            mid=edge.interpolate(.5,normalized=True)
            if site.boundary.distance(mid)>.001 and (outdoors.is_empty or outdoors.boundary.distance(mid)>.001): continue
            available=[(1.,length-1.)]
            for door in doors:
                if edge.distance(LineString([door['a'],door['b']]))>.01: continue
                lo,hi=sorted((edge.project(Point(door['a'])),edge.project(Point(door['b']))))
                available=[(x,y) for low,high in available for x,y in ((low,min(high,lo-1)),(max(low,hi+1),high)) if y-x>=2]
            if not available: continue
            lo,hi=max(available,key=lambda p:p[1]-p[0])
            width=min(5.,hi-lo)
            if width<2: continue
            center=(lo+hi)/2
            windows.append({'a':tuple(edge.interpolate(center-width/2).coords)[0], 'b':tuple(edge.interpolate(center+width/2).coords)[0], 'roomId':room['placementId']})
    fixtures=[]; stair_notes=[]
    for room in rooms:
        room['fixtures']=[]
        if room['outdoor']: continue
        name=(room['roomId']+' '+room['room']).lower()
        kind=('stair' if 'stair' in name or 'landing' in name else 'bed' if 'bed' in name else 'kitchen' if 'kitchen' in name else 'bath' if any(x in name for x in ('bath','toilet','wc')) else 'sofa' if any(x in name for x in ('living','drawing')) else 'table' if 'dining' in name else None)
        if not kind: continue
        a=room['anchor'];rw,rh=a['x2']-a['x1'],a['y2']-a['y1']
        dimensions={'stair':(6.3,11.),'bed':(5.5,7.),'kitchen':(8.,4.),'bath':(5.5,3.),'sofa':(8.,5.5),'table':(6.,5.5)}
        fw,fh=dimensions[kind]
        if kind=='stair' and min(rw,rh)<7.5:
            fw,fh=3.,min(10.,max(rw,rh)-2.)
        # Try both orientations and all corners. Door approach/swing zones stay
        # clear; an unfittable symbol is omitted, never forced across a wall.
        clearances=[]
        for door in doors:
            if room['placementId'] in (door['fromPlacementId'],door['toPlacementId']):
                clearances.append(LineString([door['a'],door['b']]).buffer(3.,cap_style=2))
        occupied=unary_union(clearances)
        candidates=[]
        inset=.45 if kind=='stair' else .65
        sizes=[(fw,fh)]
        if kind=='stair': sizes.extend([(3.,9.),(3.,6.)])
        for fw,fh in sizes:
            for rotate in (False,True):
                width,height=(fh,fw) if rotate else (fw,fh)
                if width>rw-2*inset or height>rh-2*inset: continue
                for x in (a['x1']+inset,a['x2']-inset-width):
                    for y in (a['y2']-inset-height,a['y1']+inset):
                        footprint=box(x,y,x+width,y+height)
                        if room['shape'].buffer(-.3).covers(footprint) and (occupied.is_empty or not footprint.intersects(occupied)):
                            candidates.append((y, -x, rotate, (x,y,x+width,y+height)))
            if candidates: break
        if not candidates:
            if kind=='stair': stair_notes.append(f'{room["room"]}: the available space cannot contain the proposed stair footprint with clear door approaches.')
            continue
        _,_,rotate,bounds=max(candidates)
        fixture=symbol(kind,bounds,rotate,fw,fh)
        fixture['roomId']=room['placementId']; fixtures.append(fixture);room['fixtures'].append(fixture)
    # Reserve an actual empty rectangle for names so stairs/furniture do not
    # disappear beneath the text. This is annotation placement, not a room edit.
    for room in rooms:
        a=room['anchor']; region=room['shape'].buffer(-.4,join_style=2)
        for fixture in room['fixtures']:
            region=region.difference(box(*fixture['bounds']).buffer(.3, join_style=2))
        for door in doors:
            if room['placementId']==door['toPlacementId']:
                points=[door['a'],door['b'],door['leaf']]
                region=region.difference(box(min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)))
        rects=[]
        for p in parts(region):
            if p.geom_type!='Polygon': continue
            xs=sorted({v[0] for v in p.exterior.coords});ys=sorted({v[1] for v in p.exterior.coords})
            # Bounded even for a restored map with many small wall segments.
            # Prefer long spans first; never enumerate millions of rectangles.
            x_spans=sorted(combinations(xs,2),key=lambda v:v[1]-v[0],reverse=True)
            y_spans=sorted(combinations(ys,2),key=lambda v:v[1]-v[0],reverse=True)
            for (x1,x2),(y1,y2) in islice(product(x_spans,y_spans),2048):
                r=box(x1,y1,x2,y2)
                if p.covers(r):rects.append((min((x2-x1)/2, y2-y1)**2 * r.area**.15, r.bounds))
        room['labelBounds']=max(rects)[1] if rects else (a['x1'],a['y1'],a['x2'],a['y2'])
        room['labelRegions']=[r for _,r in rects] or [room['labelBounds']]
    # All wall footprints use these same openings in 2D and CAD. 3D splits the
    # same segments vertically into sill, opening and lintel bands.
    raw_walls=unary_union([LineString([w['a'],w['b']]).buffer(w['thickness']/2,cap_style=2,join_style=2) for w in walls])
    cuts=unary_union([LineString([o['a'],o['b']]).buffer(.5,cap_style=2) for o in [*doors,*windows]])
    return {'walls':walls,'wallFootprint':raw_walls.difference(cuts), 'doors':doors,'windows':windows,'fixtures':fixtures,'notes':stair_notes}


def symbol(kind,bounds,rotate,width,depth):
    """Readable plan symbols plus matching raised geometry (dimensions in feet)."""
    x,y,_,_=bounds
    def p(u,v):return (x+v,y+u) if rotate else (x+u,y+v)
    lines=[];patches=[];solids=[]
    def outline(points,closed=True):lines.append({'points':[p(*q) for q in points],'closed':closed})
    def rectangle(a,b,c,d,z=0,height=0,tone='fixture'):
        pts=rect_points((a,b,c,d));patches.append({'points':[p(*q) for q in pts],'tone':tone})
        outline(pts)
        if height:solids.append({'points':[p(*q) for q in pts],'z':z,'height':height,'tone':tone})
    if kind=='stair':
        twin=width>=6
        lane=(width-.3)/2 if twin else width
        landing=lane if twin else 0
        run=depth-landing
        count=10 if twin else 12
        for i in range(count):
            low=i*run/count;high=(i+1)*run/count
            rectangle(0,low,lane,high,0,(i+1)*.42,'stair')
            if twin:rectangle(lane+.3,low,width,high,0,(2*count-i)*.42,'stair')
        if twin:rectangle(0,run,width,depth,0,count*.42,'stair')
        outline([(lane/2,.3),(lane/2,run-.4)],False)
        outline([(lane/2-.45,run-1),(lane/2,run-.4),(lane/2+.45,run-1)],False)
        if twin:
            outline([(lane+.3+lane/2,run-.3),(lane+.3+lane/2,.4)],False)
            outline([(lane+.3+lane/2-.45,1),(lane+.3+lane/2,.4),(lane+.3+lane/2+.45,1)],False)
    elif kind=='bed':
        rectangle(0,0,width,depth,0,1.1)
        rectangle(.12,.15,width-.12,depth-.15,1.1,.55,'linen')
        rectangle(.12,depth-.35,width-.12,depth,0,2.4,'wood')
        for lo in (.35,width/2+.15):rectangle(lo,depth-1.6,lo+width/2-.5,depth-.5,1.65,.2,'pillow')
        outline([(0,depth-2),(width,depth-2)],False)
        outline([(0,1.1),(width,1.1)],False)
    elif kind=='sofa':
        rectangle(0,depth-3,width,depth,0,1.4)
        rectangle(0,depth-.6,width,depth,0,2.6,'linen')
        for lo in (0,width-.55):rectangle(lo,depth-3,lo+.55,depth,0,2.1,'linen')
        for i in range(3):rectangle(.65+i*(width-1.3)/3,depth-2.9,.65+(i+1)*(width-1.3)/3-.1,depth-.7,1.4,.25,'linen')
        rectangle(1.8,0,width-1.8,1.7,0,1.35,'wood')
    elif kind=='kitchen':
        rectangle(0,0,2,depth,0,2.8,'wood');rectangle(2,depth-2,width,depth,0,2.8,'wood')
        rectangle(.2,depth-1.8,1.8,depth-.2,2.8,.12,'metal')
        outline(ellipse(1,depth-1,.6,.5))
        for xx in (width-1.55,width-.65):
            for yy in (depth-1.55,depth-.65):outline(ellipse(xx,yy,.25,.25))
        for xx in range(3,int(width-2),2):outline([(xx,depth-2),(xx,depth)],False)
    elif kind=='bath':
        rectangle(0,depth-.65,1.7,depth,0,2.2,'pillow')
        outline(ellipse(.85,depth-1.55,.7,.85))
        pts=[p(*q) for q in ellipse(.85,depth-1.55,.7,.85)]
        patches.append({'points':pts,'tone':'pillow'});solids.append({'points':pts,'z':0,'height':1.35,'tone':'pillow'})
        rectangle(width-1.8,depth-1.7,width,depth,0,2.4,'pillow')
        outline(ellipse(width-.9,depth-.85,.65,.5))
    elif kind=='table':
        rectangle(.5,1.3,width-.5,depth-1.3,0,2.5,'wood')
        for xx in (1,width-2):
            for yy in (0,depth-1.1):rectangle(xx,yy,xx+1,yy+1.1,0,1.5,'linen')
    return {'kind':kind,'bounds':bounds,'lines':lines,'patches':patches,'solids':solids}
