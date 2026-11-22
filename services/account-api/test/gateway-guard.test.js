import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayGuard } from '../src/gateway-guard.js';
const secret='a'.repeat(64);
const req=(path,headers={},method='GET')=>new Request('https://example.invalid'+path,{headers,method});
for(const [health,privatePath] of [['/api/v1/health','/api/v1/auth/me'],['/operator/v1/health','/operator/v1/workspace/users']]){
 test('gateway guard '+health,()=>{
  assert.equal(gatewayGuard(req(health),health,''),null);
  assert.equal(gatewayGuard(req(health+'?x=1'),health,secret).status,403);
  assert.equal(gatewayGuard(req(health,{},'POST'),health,secret).status,403);
  assert.equal(gatewayGuard(req(privatePath),health,'').status,503);
  assert.equal(gatewayGuard(req(privatePath,{origin:'https://rk-hud.github.io','cf-connecting-ip':'127.0.0.1'}),health,secret).status,403);
  assert.equal(gatewayGuard(req(privatePath,{'x-cs-gateway-secret':'b'.repeat(64)}),health,secret).status,403);
  assert.equal(gatewayGuard(req(privatePath,{'x-cs-gateway-secret':secret+', '+secret}),health,secret).status,403);
  assert.equal(gatewayGuard(req(privatePath,{'x-cs-gateway-secret':secret}),health,secret),null);
 });
}
