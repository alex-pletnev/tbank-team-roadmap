import http from 'node:http';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/bundle.mjs'],{stdio:'inherit'});
const worker=(await import('../dist/server/index.js')).default;
const file='.preview-state.json';
const bucket={
 async get(){if(!fs.existsSync(file))return null;const o=JSON.parse(fs.readFileSync(file,'utf8'));return {...o,json:async()=>JSON.parse(o.text)};},
 async put(key,text,{onlyIf}={}){const existing=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;const match=onlyIf?.get('If-Match');if((match&&match!==existing?.httpEtag)||(onlyIf?.get('If-None-Match')==='*'&&existing))return null;const etag=createHash('sha256').update(text).digest('hex'),object={text,etag,httpEtag:'"'+etag+'"'};fs.writeFileSync(file,JSON.stringify(object));return object;}
};
const env={BUCKET:bucket,EDIT_KEY_SHA256:createHash('sha256').update('preview-key-local-only').digest('hex'),ALLOWED_ORIGIN:'https://alex-pletnev.github.io'};
const portIndex=process.argv.indexOf('--port');
const previewPort=Number(process.env.PORT||(portIndex>=0?process.argv[portIndex+1]:3000));
http.createServer(async(req,res)=>{
 if(req.url==='/__mobile'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html><meta charset="utf-8"><title>Mobile preview</title><body style="margin:20px;background:#ddd"><iframe title="Мобильная версия" src="/" style="border:0;width:360px;height:1800px;background:white"></iframe></body></html>');return;}
 try{const chunks=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks);const origin=(req.headers['x-forwarded-proto']||'http')+'://'+req.headers.host;const r=new Request(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});const response=await worker.fetch(r,env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
 catch{res.writeHead(500);res.end('Preview error');}
}).listen(previewPort,'0.0.0.0',()=>console.log('Roadmap preview is ready.'));
