require('dotenv').config();
const express = require('express');
const path = require('path');
const connectDB = require('./config/db');
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>res.json({status:'ok',uptime:process.uptime()}));
app.get('/api/health',(req,res)=>res.json({success:true,message:'Smart Scholarship Finder API is running'}));
app.use('/api/scholarships',require('./routes/scholarships'));
app.use('/api/*path',(req,res)=>res.status(404).json({success:false,message:'API route not found'}));
app.use((req,res,next)=>req.method==='GET'?res.sendFile(path.join(__dirname,'public','index.html')):next());
app.use((err,req,res,next)=>{console.error('[API error]',err.message);res.status(err.status||500).json({success:false,message:(err.status||500)>=500?'Something went wrong. Please try again.':err.message});});
async function start(){
  try {
    await connectDB();
    const server=app.listen(PORT,HOST,()=>console.log(`✅ Smart Scholarship Finder: http://${HOST}:${PORT}`));
    server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`Port ${PORT} is busy. Change PORT in .env.`:err.message);process.exitCode=1;});
  } catch(err) { console.error('MongoDB connection failed:',err.message);console.error('Start MongoDB and check MONGO_URI.');process.exitCode=1; }
}
if(require.main===module) start();
module.exports={app,start};