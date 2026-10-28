const router = require('express').Router();
const studentController = require('../controllers/studentController');
const { authenticate, requireStudent } = require('../middleware/auth');

// All student routes require valid student token
router.use(authenticate, requireStudent);

router.get('/profile', studentController.getProfile);
router.put('/profile', studentController.updateProfile);
router.get('/saved', studentController.getSaved);
router.post('/saved/:id', studentController.toggleSaved);
router.get('/matches', studentController.getMyMatches);

module.exports = router;

