const express=require('express');const fs=require('fs');const path=require('path');const crypto=require('crypto');const {execFile}=require('child_process');
const app=express();app.use(express.json({limit:'1mb'}));
const PORT=process.env.PORT||10000,BASE=process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`;const MEDIA='/tmp/media-ingest';fs.mkdirSync(MEDIA,{recursive:true});
const apiKey=process.env.MEDIA_INGEST_API_KEY||'';
function auth(req,res,next){if(apiKey&&req.get('authorization')!==`Bearer ${apiKey}`)return res.status(401).json({error:'Unauthorized'});next()}
function validUrl(u){try{const x=new URL(u);return ['youtube.com','www.youtube.com','youtu.be','instagram.com','www.instagram.com','facebook.com','www.facebook.com','fb.watch'].some(d=>x.hostname===d||x.hostname.endsWith('.'+d));}catch{return false}}
app.get('/health',(req,res)=>res.json({ok:true,service:'media-ingest'}));
app.post('/v1/resolve',auth,(req,res)=>{const{url,start=0,end}=req.body||{};if(!validUrl(url))return res.status(400).json({error:'Unsupported or invalid URL'});if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return res.status(400).json({error:'Invalid time range'});const id=crypto.randomUUID();const dir=path.join(MEDIA,id);fs.mkdirSync(dir,{recursive:true});jobs.set(id,{status:'processing',progress:'queued',created:Date.now()});res.json({jobId:id});
 const out=path.join(dir,'clip.%(ext)s');const args=['--no-playlist','--quiet','--no-warnings','--merge-output-format','mp4','--download-sections',`*${start}-${end}`,'-o',out,url];jobs.get(id).progress='downloading';execFile('yt-dlp',args,{timeout:1000*60*15,maxBuffer:1024*1024*4},(err,stdout,stderr)=>{if(err){jobs.set(id,{status:'error',error:(stderr||err.message).slice(-2000)});return}const files=fs.readdirSync(dir).filter(x=>x.endsWith('.mp4'));if(!files.length){jobs.set(id,{status:'error',error:'No MP4 produced'});return}const fname=files[0];jobs.set(id,{status:'done',filename:fname,downloadUrl:`${BASE}/v1/files/${id}/${encodeURIComponent(fname)}`})})
});
const jobs=new Map();
app.get('/v1/jobs/:id',auth,(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:'Unknown job'});res.json(j)});
app.get('/v1/files/:id/:name',(req,res)=>{const p=path.join(MEDIA,req.params.id,req.params.name);if(!fs.existsSync(p))return res.sendStatus(404);res.download(p,req.params.name,()=>{try{fs.rmSync(path.dirname(p),{recursive:true,force:true});jobs.delete(req.params.id)}catch{}})});
setInterval(()=>{const cutoff=Date.now()-30*60*1000;for(const[id,j]of jobs){if(j.created<cutoff){try{fs.rmSync(path.join(MEDIA,id),{recursive:true,force:true})}catch{}jobs.delete(id)}}},5*60*1000);
app.listen(PORT,()=>console.log(`Media Ingest backend listening on ${PORT}`));