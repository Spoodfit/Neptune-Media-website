import base,{StudioStore,WebTvEncoder} from './entry-v34.js';
import {handleWebTvMediaRequest,isWebTvMediaRoute,WEBTV_MEDIA_RELEASE} from './webtv-media-v1.js';

export {StudioStore,WebTvEncoder};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(isWebTvMediaRoute(url.pathname)){
      if(url.pathname.startsWith('/media/webtv/'))return handleWebTvMediaRequest(request,env,{authenticated:true});
      const auth=await studioAuth(request,env,ctx);
      return handleWebTvMediaRequest(request,env,auth.ok?{authenticated:true,user:auth.user}:{authenticated:false});
    }
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      const data=await response.json().catch(()=>({}));
      response=new Response(JSON.stringify({...data,webTvMedia:WEBTV_MEDIA_RELEASE}),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);},
};

async function studioAuth(request,env,ctx){
  const url=new URL(request.url);url.pathname='/api/auth/status';url.search='';
  const probe=new Request(url.toString(),{method:'GET',headers:request.headers});
  const response=await base.fetch(probe,env,ctx);
  if(!response.ok)return{ok:false};
  const data=await response.json().catch(()=>({}));
  const user=data.user||{};
  if(data.authenticated===false||!['admin','editor'].includes(String(user.role||'')))return{ok:false};
  return{ok:true,user};
}
