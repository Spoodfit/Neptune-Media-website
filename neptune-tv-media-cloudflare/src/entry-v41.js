import base,{StudioStore,WebTvEncoder} from './entry-v40.js';
import {
  augmentDriveUploadReleaseV137,
  injectDriveUploadResilienceV137,
  isDriveUploadAssetV137,
  isDriveUploadDocumentV137,
  transformDriveUploadAssetV137,
} from './drive-upload-resilience-v137.js';

export {StudioStore,WebTvEncoder};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&response.ok&&isDriveUploadAssetV137(url.pathname)){
      return transformDriveUploadAssetV137(response);
    }
    if(request.method==='GET'&&response.ok&&isDriveUploadDocumentV137(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await injectDriveUploadResilienceV137(response);
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentDriveUploadReleaseV137(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};
