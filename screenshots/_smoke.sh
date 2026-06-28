#!/bin/bash
set -e
echo "=== 1. Login ==="
curl -s -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin5@test.local","password":"SmokePwd123!","role":"admin"}' \
  > /tmp/login.json
ls -la /tmp/login.json
python3 -c 'import json; d=json.load(open("/tmp/login.json")); print("login success:", d["success"])'

echo "=== 2. Token ==="
python3 -c 'import json; print(json.load(open("/tmp/login.json"))["data"]["access"])' > /tmp/tok.txt
wc -c /tmp/tok.txt

echo "=== 3. List all reviews ==="
curl -s -o /tmp/r.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  'http://localhost:8000/api/v1/admin/reviews/'
python3 -c "
import json
d = json.load(open('/tmp/r.json'))
print('success:', d.get('success'))
print('count:', d.get('count'))
print('results count:', len(d.get('results') or []))
if d.get('results'):
    r = d['results'][0]
    print('row keys:', sorted(r.keys()))
    print('product:', r['product']['name'])
    print('is_hidden:', r['is_hidden'])
    print('vendor:', r['vendor'])
"

echo "=== 4. Hide a review ==="
RID=$(python3 -c "import json; print(json.load(open('/tmp/r.json'))['results'][0]['id'])")
echo "Review ID: $RID"
curl -s -o /tmp/m.json -w "HTTP %{http_code}\n" -X PATCH \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  -H "Content-Type: application/json" \
  -d '{"is_hidden":true}' \
  "http://localhost:8000/api/v1/admin/reviews/$RID/moderate/"
python3 -c "import json; d=json.load(open('/tmp/m.json')); print('moderate success:', d['success'], 'is_hidden:', d['data']['is_hidden'])"

echo "=== 5. Restore ==="
curl -s -o /tmp/m.json -w "HTTP %{http_code}\n" -X PATCH \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  -H "Content-Type: application/json" \
  -d '{"is_hidden":false}' \
  "http://localhost:8000/api/v1/admin/reviews/$RID/moderate/"
python3 -c "import json; d=json.load(open('/tmp/m.json')); print('restore success:', d['success'], 'is_hidden:', d['data']['is_hidden'])"

echo "=== 6. Filter is_hidden=false ==="
curl -s -o /tmp/r.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  'http://localhost:8000/api/v1/admin/reviews/?is_hidden=false'
python3 -c "import json; d=json.load(open('/tmp/r.json')); print('visible count:', d['count'], 'all visible:', all(not r['is_hidden'] for r in d['results']))"

echo "=== 7. Ordering -helpful_count ==="
curl -s -o /tmp/r.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  'http://localhost:8000/api/v1/admin/reviews/?ordering=-helpful_count'
python3 -c "import json; d=json.load(open('/tmp/r.json')); print('helpful counts:', [r['helpful_count'] for r in d['results']])"

echo "=== 8. Search=GPU ==="
curl -s -o /tmp/r.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $(cat /tmp/tok.txt)" \
  'http://localhost:8000/api/v1/admin/reviews/?search=GPU'
python3 -c "import json; d=json.load(open('/tmp/r.json')); print('GPU hits:', d['count'], 'all GPU:', all('GPU' in r['product']['name'] for r in d['results']))"

echo "=== ALL DONE ==="