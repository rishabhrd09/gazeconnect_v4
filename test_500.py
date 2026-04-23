import urllib.request, urllib.error, sys
req = urllib.request.Request('http://127.0.0.1:5050/api/floorplan/generate', data=b'{}', headers={'Content-Type':'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print(resp.read().decode())
except urllib.error.HTTPError as e:
    sys.stderr.write(e.read().decode())
