import {test} from "node:test";
import assert from "node:assert/strict";
import {geoDistanceKm,geoUrl,parseGeoLocation,parseImportedLocation,serializeGeoLocation} from "../lib/geo/location";
test("location field snapshots accept valid coordinates and reject malformed or out-of-range values",()=>{
  const raw=serializeGeoLocation({lat:17.4933,lng:78.3995,label:"Kukatpally",source:"pin"});
  assert.deepEqual(parseGeoLocation(raw),{lat:17.4933,lng:78.3995,label:"Kukatpally",source:"pin"});
  for(const bad of ["","not json",'{"lat":95,"lng":78}','{"lat":17,"lng":-181}','{"lat":"17","lng":78}','{"lat":null,"lng":78}',"[]"]){
    assert.equal(parseGeoLocation(bad),null,bad);
  }
  assert.throws(()=>serializeGeoLocation({lat:Infinity,lng:80}));
});
test("bulk location import accepts comma-separated latitude and longitude or a canonical JSON snapshot",()=>{
  const raw=parseImportedLocation("17.4933, 78.3995");
  assert.ok(raw);
  assert.deepEqual(parseGeoLocation(raw),{lat:17.4933,lng:78.3995,source:"import"});
  assert.equal(parseImportedLocation(""),"");
  assert.equal(parseImportedLocation("Kukatpally"),null);
  assert.equal(parseImportedLocation("91,80"),null);
  assert.equal(parseImportedLocation("17,180.1"),null);
  assert.equal(parseImportedLocation('{"lat":17,"lng":78}'),JSON.stringify({lat:17,lng:78}));
});
test("reference-map distance is geographic and map links use stored coordinates",()=>{
  const a={lat:17.4933,lng:78.3995},b={lat:17.4933,lng:78.3995};
  assert.equal(geoDistanceKm(a,b),0);
  assert.ok(geoDistanceKm(a,{lat:17.5,lng:78.4})<1);
  assert.ok(geoDistanceKm(a,{lat:18.1,lng:78.4})>50);
  assert.match(geoUrl(a),/^https:\/\/www\.openstreetmap\.org\/\?mlat=/);
});
