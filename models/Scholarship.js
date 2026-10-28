const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 title:{type:String,required:true,trim:true,maxlength:160},
 provider:{type:String,required:true,trim:true,maxlength:160},
 description:{type:String,required:true,trim:true,maxlength:3000},
 amount:{type:Number,required:true,min:0},currency:{type:String,enum:['INR','USD','GBP','EUR'],default:'INR'},
 deadline:{type:Date,default:null},degreeLevels:[String],fieldsOfStudy:[String],
 minGPA:{type:Number,min:0,max:100,default:0},gpaScale:{type:Number,enum:[4,10,100],default:10},
 citizenship:[String],tags:[{type:String,lowercase:true,trim:true}],applicationUrl:{type:String,default:''},
 requiredDocuments:[String],status:{type:String,enum:['published','closed'],default:'published'},isDemo:{type:Boolean,default:true}
},{timestamps:true});
schema.index({title:'text',provider:'text',description:'text',tags:'text'});
module.exports=mongoose.models.Scholarship||mongoose.model('Scholarship',schema);