import {readFileSync,writeFileSync} from 'node:fs';

const path='/app/encoder.mjs';
let source=readFileSync(path,'utf8');

const replacements=[
  {
    name:'hls segmentation',
    from:"'-hls_time','4','-hls_list_size','10','-hls_delete_threshold','3','-hls_flags','delete_segments+append_list+independent_segments+program_date_time+omit_endlist','-hls_segment_filename',join(HLS_DIR,'segment-%08d.ts')",
    to:"'-hls_time','3','-hls_list_size','12','-hls_delete_threshold','4','-hls_start_number_source','epoch','-hls_flags','delete_segments+independent_segments+program_date_time+omit_endlist+temp_file','-hls_segment_filename',join(HLS_DIR,'segment-%010d.ts')",
  },
  {
    name:'segment cache policy',
    from:"name.endsWith('.m3u8')?'no-store, max-age=0':'public, max-age=8'",
    to:"name.endsWith('.m3u8')?'no-store, max-age=0':'public, max-age=30, immutable'",
  },
];

for(const replacement of replacements){
  const matches=source.split(replacement.from).length-1;
  if(matches!==1)throw new Error(`smoothness_patch_${replacement.name.replace(/\s+/g,'_')}_expected_once_got_${matches}`);
  source=source.replace(replacement.from,replacement.to);
}

writeFileSync(path,source,'utf8');
console.log('neptune_webtv_smoothness_v124_applied');
