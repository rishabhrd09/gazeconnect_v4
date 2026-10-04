"""Architectural 2D sheets and a furnished axonometric cutaway for Compass."""
import math
import cairo
from shapely.geometry import LineString
from compass_architecture import parts, rect_points


def rgb(value):return tuple(int(value[i:i+2],16)/255 for i in (1,3,5))
def paint(c,color):c.set_source_rgb(*rgb(color))
def mix(a,b,t):return '#'+''.join(f'{round((x*(1-t)+y*t)*255):02X}' for x,y in zip(rgb(a),rgb(b)))
def path(c,points,close=True):
    c.new_path()
    for i,p in enumerate(points):(c.move_to if i==0 else c.line_to)(*p)
    if close:c.close_path()
def stroke(c,points,color,width=1.5,close=False):
    path(c,points,close);paint(c,color);c.set_line_width(width);c.stroke()
def text(c,x,y,value,size,color,bold=False,center=True):
    c.select_font_face('sans-serif',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    c.set_font_size(size);e=c.text_extents(str(value));paint(c,color)
    c.move_to(x-e.width/2-e.x_bearing if center else x,y);c.show_text(str(value))
def polygon(c,poly,point,fill,line_color=None,width=1):
    path(c,[point(x,y) for x,y in poly.exterior.coords])
    for ring in poly.interiors:
        for i,(x,y) in enumerate(ring.coords):(c.move_to if i==0 else c.line_to)(*point(x,y))
        c.close_path()
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD);paint(c,fill)
    if line_color:
        c.fill_preserve();paint(c,line_color);c.set_line_width(width);c.stroke()
    else:c.fill()


def sheet_size(m,technical=False):
    if technical:return 1200,1200
    # Crop unused canvas around the real aspect ratio. Never distort X vs Y to
    # occupy a landscape viewport; gaze zoom can inspect all four corners.
    width,depth=max(m['width'],m['depth']),min(m['width'],m['depth'])
    scale=min(1390/width,790/depth)
    return math.ceil(width*scale+190), math.ceil(depth*scale+160)


def fixture_palette(palette,dark):
    bg,surface,ink,muted,edge=palette
    return {'fixture':mix(surface,muted,.22), 'linen':mix(surface,muted,.16),
            'wood':'#7E7162' if dark else '#DDCBB1', 'stair':'#8A9290' if dark else '#E4DFD3',
            'pillow':'#D6DDD9' if dark else '#FFFDF8', 'metal':'#779DA4' if dark else '#BCD4D6'}


def floor_finish(c, poly, point, fill, edge, wood=False, outdoor=False):
    """Restrained floor joints plus contact shading, clipped to the true room."""
    c.save()
    path(c,[point(x,y) for x,y in poly.exterior.coords])
    for ring in poly.interiors:
        for i,(x,y) in enumerate(ring.coords):(c.move_to if i==0 else c.line_to)(*point(x,y))
        c.close_path()
    c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD);c.clip()
    x1,y1,x2,y2=poly.bounds
    # A bounded pattern count also covers very large plots without huge SVGs.
    step=max(.65 if wood else 2.5,(y2-y1)/80,(x2-x1)/80)
    colour=mix(fill,edge,.13)
    for row in range(int((y2-y1)/step)+1):
        y=y1+row*step
        stroke(c,[point(x1,y),point(x2,y)],colour,.65)
        width=step*5 if wood else step
        offset=width*.5 if wood and row%2 else 0
        for col in range(int((x2-x1)/width)+2):
            x=x1+col*width-offset
            stroke(c,[point(x,y),point(x,min(y+step,y2))],colour,.65)
    # Soft contact shading sits inside the wall; no room outline moves.
    for width,alpha in ((14,.025),(8,.035),(3,.06)):
        path(c,[point(x,y) for x,y in poly.exterior.coords])
        c.set_source_rgba(.1,.15,.15,alpha);c.set_line_width(width);c.stroke()
    c.restore()


def shaded_face(c, points, tone, strength=.08):
    path(c,points)
    ys=[p[1] for p in points]
    gradient=cairo.LinearGradient(0,min(ys),0,max(ys)+.01)
    gradient.add_color_stop_rgb(0,*rgb(mix(tone,'#FFFFFF',strength)))
    gradient.add_color_stop_rgb(1,*rgb(mix(tone,'#283A3D',strength)))
    c.set_source(gradient);c.fill_preserve()
    paint(c,mix(tone,'#283A3D',.14));c.set_line_width(.55);c.stroke()


def draw_2d(c,m,palette,cw,ch,technical=False):
    bg,surface,ink,muted,edge=palette
    dark=sum(rgb(bg))<1.5 and not technical
    wall='#C0CBC9' if dark else '#3F4C4F'
    symbol_ink='#BDCCC9' if dark else '#72817E'
    glass='#8FC4CE' if dark else '#367B8D'
    rotated=not technical and m['depth']>m['width']
    across,down=(m['depth'],m['width']) if rotated else (m['width'],m['depth'])
    s=min((cw-190)/across,(ch-(260 if technical else 170))/down)
    left=(cw-across*s)/2;top=64;bottom=top+down*s
    point=(lambda x,y:(left+y*s,top+x*s)) if rotated else (lambda x,y:(left+x*s,top+(m['depth']-y)*s))
    c.rectangle(left,top,across*s,down*s);paint(c,surface);c.fill()
    # A light plot outline remains visible on partial plans, without implying
    # that every empty grid cell is a built room.
    c.set_dash([5,7]);stroke(c,[point(0,0),point(m['width'],0),point(m['width'],m['depth']),point(0,m['depth'])],edge,1.5,True);c.set_dash([])
    for room in m['rooms']:
        fill='#FFFFFF' if technical else mix(surface,room['tone'],.13 if dark else .46)
        if room['outdoor']:fill=mix(surface,'#6D9770',.16 if dark else .2)
        for poly in room['polygons']:
            polygon(c,poly,point,fill)
            if not technical:
                floor_finish(c,poly,point,fill,edge,'bed' in room['room'].lower(),room['outdoor'])
    fp=fixture_palette(palette,dark)
    for fixture in m['architecture']['fixtures']:
        if not technical:
            c.save();c.translate(2,3)
            for patch in fixture['patches']:
                path(c,[point(*p) for p in patch['points']]);c.set_source_rgba(.08,.12,.12,.10);c.fill()
            c.restore()
        for patch in fixture['patches']:
            path(c,[point(*p) for p in patch['points']]);paint(c,'#F6F6F4' if technical else fp[patch['tone']]);c.fill()
        for item in fixture['lines']:
            stroke(c,[point(*p) for p in item['points']],symbol_ink,1.3,item['closed'])
    for poly in parts(m['architecture']['wallFootprint']):
        if poly.geom_type=='Polygon':polygon(c,poly,point,wall, mix(wall,'#000000',.15),.7)
    for window in m['architecture']['windows']:
        a,b=window['a'],window['b'];length=math.dist(a,b)
        n=(-(b[1]-a[1])/length,(b[0]-a[0])/length)
        for off in (-.18,.18):stroke(c,[point(p[0]+n[0]*off,p[1]+n[1]*off) for p in (a,b)],glass,1.5)
        for p in (a,b):stroke(c,[point(p[0]+n[0]*.38,p[1]+n[1]*.38),point(p[0]-n[0]*.38,p[1]-n[1]*.38)],wall,2)
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        stroke(c,[point(mid[0]-n[0]*.18,mid[1]-n[1]*.18),point(mid[0]+n[0]*.18,mid[1]+n[1]*.18)],glass,1.5)
    for door in m['architecture']['doors']:
        stroke(c,[point(*door['a']),point(*door['leaf'])],wall,2)
        stroke(c,[point(*p) for p in door['arc']],symbol_ink,1.2)
    # Names always occupy space that is clear of the furniture/stair footprint.
    for index,room in enumerate(m['rooms'],1):
        bounds=max(room['labelRegions'],key=lambda r:min((r[3]-r[1])/2,r[2]-r[0])**2*((r[3]-r[1])*(r[2]-r[0]))**.15) if rotated else room['labelBounds']
        x1,y1,x2,y2=bounds;x,y=point((x1+x2)/2,(y1+y2)/2)
        span_x,span_y=((y2-y1),(x2-x1)) if rotated else ((x2-x1),(y2-y1))
        avail=max(30,span_x*s-16);height=max(30,span_y*s-10)
        size=min(38 if not technical else 33,max(18,avail/7.5))
        label=room['room']
        def wrap(sz):
            c.select_font_face('sans-serif',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD);c.set_font_size(sz)
            lines=[];current=''
            for word in label.split():
                trial=(current+' '+word).strip()
                if current and c.text_extents(trial).width>avail:lines.append(current);current=word
                else:current=trial
            if current:lines.append(current)
            return lines
        wrapped=wrap(size)
        while size>12 and ((len(wrapped)*1.2+(2.5 if technical else 1.7))*size>height or any(c.text_extents(t).width>avail for t in wrapped)):
            size-=1;wrapped=wrap(size)
        total=(len(wrapped)*1.2+(.9 if not technical else 1.7))*size
        for i,value in enumerate(wrapped):text(c,x,y-total/2+size+i*size*1.2,value,size,ink,True)
        r=room['coords'];dims=f'{r["x2"]-r["x1"]:.1f} × {r["y2"]-r["y1"]:.1f} ft'
        if abs(room['shape'].area-room['shape'].envelope.area)>.01:dims+=' bounds'
        text(c,x,y+total/2-(size*.8 if technical else 0),dims,max(11,size*.67),muted)
        if technical:text(c,x,y+total/2,f'{room["area_sqft"]:.1f} sq ft',max(10,size*.58),muted)
        if any(f['kind']=='stair' for f in room['fixtures']):
            f=next(f for f in room['fixtures'] if f['kind']=='stair');a,b,e,d=f['bounds']
            tx,ty=point((a+e)/2,b+.3);text(c,tx,ty-3,'UP' if m['floor']=='ground' else 'STAIR',12,wall,True)
    # One restrained dimension chain and overall dimensions, outside the rooms.
    width=across;depth=down
    stroke(c,[(left,top-29),(left+width*s,top-29)],muted,1)
    for x in (left,left+width*s):
        stroke(c,[(x,top-8),(x,top-42)],edge,1)
        stroke(c,[(x-4,top-24),(x+4,top-34)],ink,1.5)
    text(c,cw/2,top-39,f'{width:g} ft',25,ink,True)
    dim_x=left+width*s+30 if rotated else left-30
    stroke(c,[(dim_x,top),(dim_x,bottom)],muted,1)
    for y in (top,bottom):
        stroke(c,[(dim_x-12,y),(dim_x+12,y)],edge,1)
        stroke(c,[(dim_x-5,y+4),(dim_x+5,y-4)],ink,1.5)
    c.save();c.translate(dim_x+(25 if rotated else -10),(top+bottom)/2);c.rotate(-math.pi/2);text(c,0,0,f'{depth:g} ft',23,ink,True);c.restore()
    if technical:
        xs=sorted({0.,width,*[float(v) for room in m['rooms'] for poly in room['polygons'] for x,y in poly.exterior.coords for v in [x]]})
        for a,b in zip(xs,xs[1:]):
            xa,ya=point(a,0);xb,_=point(b,0)
            stroke(c,[(xa,bottom+20),(xb,bottom+20)],muted,1)
            for xx in (xa,xb):stroke(c,[(xx-3,bottom+24),(xx+3,bottom+16)],ink,1.4)
            if (b-a)*s>36:text(c,(xa+xb)/2,bottom+42,f'{b-a:g}′',16,muted)
    road_y=bottom+(66 if technical else 25)
    if rotated:
        stroke(c,[(left-23,top),(left-23,bottom)],edge,1)
        c.save();c.translate(left-42,(top+bottom)/2);c.rotate(-math.pi/2)
        text(c,0,0,'FRONT / ROAD · '+m['facing'].upper(),22,ink,True);c.restore()
        text(c,cw/2,road_y+12,'Front / road on the left · true proportions',22,ink,True)
    else:
        stroke(c,[(left,road_y-14),(left+width*s,road_y-14)],edge,1)
        text(c,cw/2,road_y+14,f'FRONT / ROAD · {m["facing"].upper()}',23,ink,True)
    text(c,cw/2,road_y+39,'Proposed architectural details · dimensions in feet',17,muted)
    if technical:text(c,cw/2,ch-47,m['floor'].upper()+' FLOOR · DIMENSIONED REVIEW DRAWING',21,ink,True)


def draw_3d(c,m,palette,angle,room_id=None):
    bg,surface,ink,muted,edge=palette;dark=sum(rgb(bg))<1.5
    rooms=m['rooms']
    focus=next((r for r in rooms if r['placementId']==room_id),None) if room_id else None
    if room_id and focus is None:
        raise ValueError('Choose a room on the selected floor.')
    if focus: rooms=[focus]
    x1,y1,x2,y2=focus['shape'].bounds if focus else (0,0,m['width'],m['depth'])
    theta=angle*math.pi/2
    def project(x,y,z=0):
        x,y=x-(x1+x2)/2,y-(y1+y2)/2
        x,y=x*math.cos(theta)-y*math.sin(theta),x*math.sin(theta)+y*math.cos(theta)
        return ((x-y)*.866,-(x+y)*.5-z)
    corners=[project(x,y,z) for x in (x1,x2) for y in (y1,y2) for z in (-.6,8.5)]
    minx,miny=min(p[0] for p in corners),min(p[1] for p in corners)
    maxx,maxy=max(p[0] for p in corners),max(p[1] for p in corners)
    s=min(1440/(maxx-minx),790/(maxy-miny))
    def point(x,y,z=0):
        xx,yy=project(x,y,z);return (800+(xx-(minx+maxx)/2)*s,440+(yy-(miny+maxy)/2)*s)
    faces=[]
    def solid(points,z,height,tone):
        # Painter order uses ground depth, so a tall rear wall is not painted
        # over furniture just because its top projects higher on the sheet.
        for a,b in zip(points,points[1:]+points[:1]):
            depth=(project(*a)[1]+project(*b)[1])/2
            shade=mix(tone,'#000000',.15 if abs(a[0]-b[0])<.01 else .26)
            faces.append((depth,z,[point(*a,z),point(*b,z),point(*b,z+height),point(*a,z+height)],shade))
        depth=sum(project(*p)[1] for p in points)/len(points)
        faces.append((depth,z+height,[point(*p,z+height) for p in points],tone))
    if focus:
        # Each source rectangle remains occupied; an L-shaped room's void is
        # never filled by a rectangular "room zoom" crop.
        for rect in focus['geometryRects']:
            solid(rect_points((rect['x1'],rect['y1'],rect['x2'],rect['y2'])),-.6,.6,'#607476' if dark else '#CACFC7')
    else:
        solid(rect_points((0,0,m['width'],m['depth'])),-.6,.6,'#607476' if dark else '#CACFC7')
    for _,_,ps,tone in sorted(faces,key=lambda f:(f[0],f[1])):
        path(c,ps);paint(c,tone);c.fill()
    faces=[]
    for room in rooms:
        fill=mix(surface,room['tone'],.3 if dark else .55)
        if room['outdoor']:fill=mix(surface,'#719975',.5)
        for poly in room['polygons']:
            polygon(c,poly,point,fill,edge,.6)
            floor_finish(c,poly,point,fill,edge,'bed' in room['room'].lower(),room['outdoor'])
    fp=fixture_palette(palette,dark)
    for fixture in m['architecture']['fixtures']:
        if focus and fixture['roomId']!=room_id: continue
        for obj in fixture['solids']:
            # Approximate contact shading keeps immediate previews inexpensive.
            shadow=[point(x+.15,y-.18,.015) for x,y in obj['points']]
            path(c,shadow);c.set_source_rgba(.1,.14,.16,.09);c.fill()
            solid(obj['points'],obj['z'],obj['height'],fp[obj['tone']])
    walls=m['architecture']['walls']; openings=[('door',o) for o in m['architecture']['doors']]+[('window',o) for o in m['architecture']['windows']]
    for wall in walls:
        if focus and focus['shape'].boundary.intersection(LineString([wall['a'],wall['b']])).length<.01: continue
        a,b=wall['a'],wall['b'];length=math.dist(a,b);dx,dy=(b[0]-a[0])/length,(b[1]-a[1])/length
        # Rear exterior walls remain at full height; near walls are cut down to
        # reveal the plan. Internal walls still have volume and a visible cap.
        middle=((a[0]+b[0])/2,(a[1]+b[1])/2)
        outside=wall['exterior'] or bool(focus)
        height=8.5 if outside and project(*middle)[1]<-1 else 1.25 if outside else 2.5
        intervals=[0.,length];cuts=[];edge_line=LineString([a,b])
        for kind,o in openings:
            opening=LineString([o['a'],o['b']]);overlap=edge_line.intersection(opening)
            if overlap.length<.01:continue
            from shapely.geometry import Point
            lo,hi=sorted((edge_line.project(Point(o['a'])),edge_line.project(Point(o['b']))))
            lo,hi=max(0.,lo),min(length,hi);intervals.extend([lo,hi]);cuts.append((lo,hi,kind))
        intervals=sorted(set(intervals));t=wall['thickness']/2
        tone='#A4B2B0' if dark else '#F1EEE4'
        for lo,hi in zip(intervals,intervals[1:]):
            kind=next((kind for x,y,kind in cuts if x-.001<=(lo+hi)/2<=y+.001),None)
            spans=[(0.,height)] if not kind else ([(0.,min(height,3)),(7.,height)] if kind=='window' else [(7.,height)])
            pa=(a[0]+dx*lo,a[1]+dy*lo);pb=(a[0]+dx*hi,a[1]+dy*hi)
            pts=[(pa[0]-dy*t,pa[1]+dx*t),(pb[0]-dy*t,pb[1]+dx*t),(pb[0]+dy*t,pb[1]-dx*t),(pa[0]+dy*t,pa[1]-dx*t)]
            for z,top in spans:
                if top>z:solid(pts,z,top-z,tone)
            if kind=='window' and height>3:
                # Glass is recessed into the same opening and capped by a sill.
                thin=[(pa[0]-dy*.04,pa[1]+dx*.04),(pb[0]-dy*.04,pb[1]+dx*.04),(pb[0]+dy*.04,pb[1]-dx*.04),(pa[0]+dy*.04,pa[1]-dx*.04)]
                solid(thin,3,min(7.,height)-3,'#709EA7' if dark else '#B1CFD0')
                solid(pts,2.95,.15,'#B5C4C1' if dark else '#FDFBF2')
    for _,_,ps,tone in sorted(faces,key=lambda f:(f[0],f[1])):
        shaded_face(c,ps,tone)
    # Room labels occupy the same clear region used in 2D. Names stay readable
    # rather than forcing people to decode an unexplained set of numbers.
    label_boxes=[]
    for index,room in enumerate(rooms,1):
        if focus: continue  # The large room title is outside its furnishings.
        a,b,e,d=room['labelBounds'];x,y=point((a+e)/2,(b+d)/2,.15)
        available=max(80,min(260,(e-a)*s*.95))
        name=room['room'];size=24 if len(m['rooms'])<9 else 20
        c.select_font_face('sans-serif',cairo.FONT_SLANT_NORMAL,cairo.FONT_WEIGHT_BOLD);c.set_font_size(size)
        words=[];current=''
        for word in name.split():
            trial=(current+' '+word).strip()
            if current and c.text_extents(trial).width>available:words.append(current);current=word
            else:current=trial
        if current:words.append(current)
        if len(words)>3:words=[str(index)]
        labelw=max(c.text_extents(t).width for t in words)+18;labelh=len(words)*size*1.15+8
        original=(x,y)
        candidates=[(x,y)]
        for step in range(1,18):
            candidates.extend([(x,y+step*(labelh+8)),(x,y-step*(labelh+8)),(x+step*30,y),(x-step*30,y)])
        for xx,yy in candidates:
            box=(xx-labelw/2-5,yy-labelh/2-4,xx+labelw/2+5,yy+labelh/2+4)
            if box[0]<24 or box[2]>1576 or box[1]<30 or box[3]>865: continue
            if not any(box[0]<r[2] and box[2]>r[0] and box[1]<r[3] and box[3]>r[1] for r in label_boxes):
                x,y=xx,yy;label_boxes.append(box);break
        if math.dist(original,(x,y))>1:stroke(c,[original,(x,y)],muted,1.2)
        c.rectangle(x-labelw/2,y-labelh/2,labelw,labelh);paint(c,surface);c.fill()
        for i,value in enumerate(words):text(c,x,y-labelh/2+size+2+i*size*1.15,value,size,ink,True)
    text(c,800,908,focus['room'] if focus else 'ARCHITECTURAL CUTAWAY · '+m['floor'].upper()+' FLOOR',32 if focus else 27,ink,True)
    text(c,800,945,'Room view · roof removed · proposed furnishings' if focus else 'Roof removed · front walls lowered · proposed furnishings and stair arrangement',21,muted)
