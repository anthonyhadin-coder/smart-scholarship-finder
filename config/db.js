const mongoose=require('mongoose');
module.exports=async function connectDB(){
 const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/smart_scholarship_finder';
 await mongoose.connect(uri,{serverSelectionTimeoutMS:5000});
 console.log(`🟢 MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
 return mongoose.connection;
};