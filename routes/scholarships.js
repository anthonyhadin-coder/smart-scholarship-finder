const router=require('express').Router();
const c=require('../controllers/scholarshipController');
router.get('/summary',c.summary);
router.post('/match',c.match);
router.get('/',c.list);
router.post('/',c.create);
router.get('/:id',c.getById);
module.exports=router;