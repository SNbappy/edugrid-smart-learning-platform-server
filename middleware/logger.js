const logger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${req.method} ${req.url} - ${timestamp}`);

    // Log request body for POST, PUT, PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        console.log('📝 Body:', req.body);
    }

    next();
};

module.exports = logger;
