const router = require('express').Router();
const providerController = require('../controllers/providerController');
const { authenticate, requireProvider } = require('../middleware/auth');

// All provider routes require valid provider token
router.use(authenticate, requireProvider);

router.get('/profile', providerController.getProfile);
router.put('/profile', providerController.updateProfile);
router.get('/scholarships', providerController.getMyScholarships);
router.post('/scholarships', providerController.createScholarship);
router.put('/scholarships/:id', providerController.updateScholarship);
router.patch('/scholarships/:id/status', providerController.updateStatus);
router.delete('/scholarships/:id', providerController.deleteScholarship);

module.exports = router;
