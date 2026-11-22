// Staging-only gateway. Never put its secret in browser code.
const origin='https://rk-hud.github.io';
const base='https://br-sweet-band-azhwai4r-';
const suffix='.compute.c-3.ap-southeast-1.aws.neon.tech';
const routes=[
 ['GET',/^\/api\/v1\/(health|public\/content|auth\/me|cases(?:\/[A-Za-z0-9_-]+)?)$/],
 ['POST',/^\/api\/v1\/(auth\/(register|google\/challenge|google|login|verify|forgot|reset|logout)|cases(?:\/[A-Za-z0-9_-]+\/replies)?)$/],
 ['GET',/^\/operator\/v1\/(health|summary|cases(?:\/[A-Za-z0-9_-]+)?|workspace\/(summary|users|cases|events|sessions|audit|users\/[A-Za-z0-9_-]+\/cases))$/],
 ['POST',/^\/operator\/v1\/(identity-challenge|identity-proof|challenge|begin|finish|login|logout)$/],
 ['PATCH',/^\/operator\/v1\/(cases|workspace\/users)\/[A-Za-z0-9_-]+$/]
];
export default {async fetch(request,env){
 const u=new URL(request.url), p=u.pathname, method=request.method;
 const allowedOrigin=request.headers.get('origin')===origin;
 const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','vary':'Origin'};
 if(allowedOrigin)headers['access-control-allow-origin']=origin;
 const reply=(status,value,extra={})=>new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});
 const health=method==='GET'&&!u.search&&['/health','/health/citizen','/health/operator'].includes(p);
 const preflight=method==='OPTIONS';
 const actual=preflight?request.headers.get('access-control-request-method'):method;
 if(!health&&(!allowedOrigin||!routes.some(([m,r])=>m===actual&&r.test(p))))return reply(403,{error:'route_denied'});
 if(!health&&u.search.length>2048)return reply(400,{error:'query_too_long'});
 if(!health&&(env.APPLICATION_FORWARDING!=='enabled'||! /^[a-f0-9]{64}$/.test(env.CS_GATEWAY_SECRET||'')))return reply(503,{error:'application_forwarding_disabled'});
 const ip=request.headers.get('CF-Connecting-IP');
 const bucket=health?env.HEALTH_LIMIT:env.API_LIMIT;
 try{if(!ip||!bucket)return reply(503,{error:'rate_limit_unavailable'});if(!(await bucket.limit({key:ip})).success)return reply(429,{error:'rate_limited'},{'retry-after':'60'});}catch{return reply(503,{error:'rate_limit_unavailable'});}
 if(health&&p==='/health')return reply(200,{service:'cyber-suraksha-staging-gateway',status:'health_probe_only',application_forwarding:env.APPLICATION_FORWARDING==='enabled'});
 if(preflight)return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':actual,'access-control-allow-headers':'authorization, content-type','access-control-max-age':'300'}});
 const operator=health?p.endsWith('/operator'):p.startsWith('/operator/');
 const target=base+(operator?'csownerstage':'csgooglestage')+suffix+(health?(operator?'/operator/v1/health':'/api/v1/health'):p+u.search);
 const upstreamHeaders=new Headers({accept:'application/json',origin});
 if(!health){upstreamHeaders.set('x-cs-gateway-secret',env.CS_GATEWAY_SECRET);const auth=request.headers.get('authorization');if(auth)upstreamHeaders.set('authorization',auth);}
 let body;
 if(!health&&method!=='GET'){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{error:'json_required'});
 const reader=request.body?.getReader();const chunks=[];let size=0;
 if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return reply(413,{error:'body_too_large'});}chunks.push(value);}}catch{return reply(400,{error:'invalid_body'});}}
 body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}upstreamHeaders.set('content-type','application/json');
 }
 try{const upstream=await fetch(target,{method,headers:upstreamHeaders,body,redirect:'manual',signal:AbortSignal.timeout(20000),cf:{cacheTtl:0}});
 if(health){await upstream.body?.cancel();return reply(upstream.ok?200:502,{service:operator?'operator':'citizen',upstream_http_status:upstream.status,application_forwarding:env.APPLICATION_FORWARDING==='enabled'});}
 if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();return reply(502,{error:'unexpected_redirect'});}
 if(!/^application\/json\b/i.test(upstream.headers.get('content-type')||'')){await upstream.body?.cancel();return reply(502,{error:'unexpected_upstream_response'});}
 return new Response(upstream.body,{status:upstream.status,headers});
 }catch{return reply(502,{error:'upstream_unavailable'});}
 }};
