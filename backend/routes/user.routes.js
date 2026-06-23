const { Router } = require('express');
const userService = require('../services/user.service');

const router = Router();

router.post('/search-user', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone is required' });
    }

    const user = await userService.searchByPhone(phone);
    res.json({ user: user || null });
  } catch (e) {
    console.error('Search user error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
