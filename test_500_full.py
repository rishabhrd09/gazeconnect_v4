import urllib.request, json, sys

payload = {
    'compass_map': {
        'plot': {'width_ft': 40, 'depth_ft': 50, 'facing': 'West', 'type': 'Middle Plot'},
        'grid_size': {'rows': 4, 'cols': 4},
        'ground_floor': {
            'placements': [
                {'roomId': 'living', 'room': 'Living Hall', 'cells': ['r1_c2','r2_c2'], 'area_sqft': 500},
                {'roomId': 'porch', 'room': 'Outer Lobby', 'cells': ['r1_c1','r2_c1','r3_c1','r4_c1'], 'area_sqft': 1500}
            ],
            'coverage_percent': 50
        }
    },
    'style': 'modern', 'format': 'png', 'floor': 'ground'
}

req = urllib.request.Request('http://127.0.0.1:5050/api/floorplan/generate', data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print("SUCCESS:", resp.status)
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    print(e.read().decode())
