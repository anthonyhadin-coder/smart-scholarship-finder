const router = require('express').Router();
const c = require('../controllers/scholarshipController');
const { optionalAuth } = require('../middleware/auth');

router.get('/summary', c.summary);
router.post('/match', c.match);
router.get('/', c.list);
router.get('/:id', optionalAuth, c.getById);

module.exports = router;
