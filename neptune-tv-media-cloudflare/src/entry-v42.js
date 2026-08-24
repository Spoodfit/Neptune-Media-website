import base,{StudioStore,WebTvEncoder} from './entry-v41.js';
import {
  augmentDriveManualValidationReleaseV138,
  handleDriveManualValidationV138,
  injectDriveManualValidationV138,
  isDriveManualValidationAssetV138,
  isDriveManualValidationDocumentV138,
  transformDriveManualValidationAssetV138,
} from './drive-manual-validation-v138.js';

export {StudioStore,WebTvEncoder};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const manual=await handleDriveManualValidationV138(request,env);
    if(manual)return manual;

    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&response.ok&&isDriveManualValidationAssetV138(url.pathname)){
      response=await transformDriveManualValidationAssetV138(response,url.pathname);
    }
    if(request.method==='GET'&&response.ok&&isDriveManualValidationDocumentV138(url.pathname)&&(response.headers.get('Content-Type')||'').includes('text/html')){
      response=await injectDriveManualValidationV138(response);
    }
    if(request.method==='GET'&&url.pathname==='/api/public/release'&&response.ok){
      response=await augmentDriveManualValidationReleaseV138(response);
    }
    return response;
  },
  async scheduled(controller,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(controller,env,ctx);
  },
};
