const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const path = require('path');
const app = express();

// Multer for PFP (Jun Yuan)
const profileUpload = multer({
    storage: multer.diskStorage({
        destination: path.join(__dirname, 'public', 'images'),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `profile-${req.session.user.staffId}-${Date.now()}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const isAllowedExt = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isAllowedMime = allowedTypes.test(file.mimetype);
        cb(null, isAllowedExt && isAllowedMime);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Multer for uploading ingredient images (Tong Sun)
const ingredientUpload = multer({
    storage: multer.diskStorage({
        destination: path.join(__dirname, 'public', 'images'),
        filename: (req, file, cb) => {
            cb(null, path.basename(file.originalname));
        }
    }),
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const isAllowedExt = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isAllowedMime = allowedTypes.test(file.mimetype);
        cb(null, isAllowedExt && isAllowedMime);
    },
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Database connection
const db = mysql.createConnection({
    host: 'c237-marlina-mysql.mysql.database.azure.com',
    user: 'c237_014',
    password: 'c237014@2026!',
    database: 'c237_014_team5_ca2',
    ssl: {rejectUnauthorized: false}
});
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');

// Make db available to all routes via req.db
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Check if user is logged in (Jun Yuan)
const checkAuthenticated = (req, res, next) => {
if (req.session.user) {
return next();
} else {
req.flash('error', 'Please log in to view this resource');
res.redirect('/login');
}
};

//  Check if user is manager or superadmin. (Jun Yuan)
const checkManager = (req, res, next) => {
if (req.session.user.role === 'Manager' || req.session.user.role === 'SuperAdmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/');
}
};

// Check if user is superadmin (Jun Yuan)
const checkSuperAdmin = (req, res, next) => {
if (req.session.user && req.session.user.role === 'SuperAdmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/');
}
};

// Check if user is a chef  (Jun Yuan)
const checkChef = (req, res, next) => {
if (req.session.user && req.session.user.role === 'Chef') {
return next();
} else {
req.flash('error', 'The dashboard is for chef accounts. Use the admin board instead.');
res.redirect('/');
}
};

// Check if user is Manager or Chef (exclude SuperAdmin)
const checkManagerOrChef = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'Manager' || req.session.user.role === 'Chef')) {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/');
    }
};

// (Jun Yuan)
const requireLogin = checkAuthenticated;

// Routes for login (Jun Yuan)
// Send a logged-in user back to their own role's homepage instead of the
// logged-out landing page - this is what the navbar's "Home" link and any
// bare redirect to "/" (e.g. after checkManager/checkSuperAdmin denies access)
// rely on to land people in the right place. (Jun Yuan)
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'Chef') {
            return res.redirect('/dashboard');
        } else if (req.session.user.role === 'Manager' || req.session.user.role === 'SuperAdmin') {
            return res.redirect('/admin');
        }
    }
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});

// Routes for registration (Jun Yuan)
app.get('/register', (req, res) => {
    res.render('register', { user: req.session.user, messages: req.flash('error'), formData: req.flash('formData')[0] });
});

// ValidateRegistration (Jun Yuan)
const validateRegistration = (req, res, next) => {
const { fullname, email, password } = req.body;
if (!fullname || !email || !password ) {
return res.send('All fields are required.');
}
if (password.length < 6) {
req.flash('error', 'Password should be at least 6 or more characters long');
req.flash('formData', req.body);
return res.redirect('/register');
}
// If all validations pass, proceed to the next middleware or route handler
next();
};

// Register route with validateRegistration middleware integrated (Jun Yuan)
app.post('/register', validateRegistration, (req, res) => {
    const { fullname, email, password } = req.body;
    const role = 'Chef';

    const sql = 'INSERT INTO staff (fullName, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [fullname, email, password, role], (err, result) => {
        if (err) {
            console.error('Register error:', err);
            const message = err.code === 'ER_DUP_ENTRY'
                ? 'That email is already registered. Please log in instead.'
                : 'Something went wrong while registering. Please try again.';
            req.flash('error', message);
            req.flash('formData', req.body);
            return res.redirect('/register');
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Register-manager routes (Jun Yuan)
app.get('/register-manager', checkAuthenticated, checkSuperAdmin, (req, res) => {
    res.render('registerAdmin', { user: req.session.user, messages: req.flash('error'), formData: req.flash('formData')[0] });
});

// Register-manager posting (Jun Yuan)
app.post('/register-manager', checkAuthenticated, checkSuperAdmin, validateRegistration, (req, res) => {
    const { fullname, email, password } = req.body;
    const role = 'Manager';

    const sql = 'INSERT INTO staff (fullName, email, password, role) VALUES (?, ?, SHA1(?), ?)';
    db.query(sql, [fullname, email, password, role], (err, result) => {
        if (err) {
            console.error('Register-manager error:', err);
            const message = err.code === 'ER_DUP_ENTRY'
                ? 'That email is already registered.'
                : 'Something went wrong while creating the account. Please try again.';
            req.flash('error', message);
            req.flash('formData', req.body);
            return res.redirect('/register-manager');
        }
        req.flash('success', 'Manager account created.');
        res.redirect('/admin');
    });
});

// Login route (Jun Yuan)
app.get('/login', (req, res) => {
res.render('login', {
user: req.session.user,
// Conditional rendering of flash messages for success and error messages
messages: req.flash('success'),
errors: req.flash('error'),
passwordChanged: req.query.passwordChanged === '1'
});
});

// User login route penalty (Jun Yuan)
const MAX_LOGIN_ATTEMPTS = 5;

app.post('/login', (req, res) => {
const { email, password } = req.body;
// Validate email and password
if (!email || !password) {
req.flash('error', 'All fields are required.');
return res.redirect('/login');
}

// Look up the account by email first (Jun Yuan)
const sql = 'SELECT * FROM staff WHERE email = ?';
db.query(sql, [email], (err, results) => {
if (err) {
console.error('Login error:', err);
req.flash('error', 'Something went wrong while logging in. Please try again.');
return res.redirect('/login');
}

if (results.length === 0) {
req.flash('error', 'Invalid email or password.');
return res.redirect('/login');
}

const staffMember = results[0];

if (staffMember.isLocked) {
req.flash('error', 'This account has been locked after too many failed login attempts. Ask a SuperAdmin to reactivate it.');
return res.redirect('/login');
}

const checkPasswordSql = 'SELECT staffId FROM staff WHERE staffId = ? AND password = SHA1(?)';
db.query(checkPasswordSql, [staffMember.staffId, password], (err2, matchResults) => {
if (err2) {
console.error('Login error:', err2);
req.flash('error', 'Something went wrong while logging in. Please try again.');
return res.redirect('/login');
}

if (matchResults.length > 0) {
// Correct password, reset failed attempts (Jun Yuan)
db.query('UPDATE staff SET failedAttempts = 0 WHERE staffId = ?', [staffMember.staffId], (err3) => {
if (err3) {
console.error('Failed to reset login attempts:', err3);
}
});

staffMember.failedAttempts = 0;
req.session.user = staffMember;

// Route to the page that matches the account's role (Jun Yuan)
if (staffMember.role === 'SuperAdmin') {
res.redirect('/admin');
} else if (staffMember.role === 'Manager') {
res.redirect('/admin');
} else {
res.redirect('/dashboard');
}
} else {
// Wrong password, increase counter (Jun Yuan)
const newAttempts = staffMember.failedAttempts + 1;

if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
db.query('UPDATE staff SET failedAttempts = ?, isLocked = TRUE WHERE staffId = ?', [newAttempts, staffMember.staffId], (err4) => {
if (err4) {
console.error('Failed to lock account:', err4);
}
});
req.flash('error', 'Too many failed attempts. This account has been locked. Ask a SuperAdmin to reactivate it.');
} else {
db.query('UPDATE staff SET failedAttempts = ? WHERE staffId = ?', [newAttempts, staffMember.staffId], (err4) => {
if (err4) {
console.error('Failed to update login attempts:', err4);
}
});
req.flash('error', 'Invalid email or password.');
}

res.redirect('/login');
}
});
});
});

// Admin route (Jun Yuan)
app.get('/admin', checkAuthenticated, checkManager, (req, res) => {
res.render('admin', { user: req.session.user });
});

// User Management route(Jun Yuan)
app.get('/user-management', checkAuthenticated, checkSuperAdmin, (req, res) => {
    const sql = 'SELECT staffId, fullName, email, role, failedAttempts, isLocked FROM staff ORDER BY fullName ASC';
    db.query(sql, (err, staffList) => {
        if (err) {
            console.error('User management error:', err);
            req.flash('error', 'Could not load the staff list. Please try again.');
            return res.redirect('/');
        }
        res.render('userManagement', {
            user: req.session.user,
            staffList,
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    });
});

app.post('/user-management/:id/reactivate', checkAuthenticated, checkSuperAdmin, (req, res) => {
    const staffId = req.params.id;
    const sql = 'UPDATE staff SET isLocked = FALSE, failedAttempts = 0 WHERE staffId = ?';
    db.query(sql, [staffId], (err) => {
        if (err) {
            console.error('Reactivate account error:', err);
            req.flash('error', 'Could not reactivate that account. Please try again.');
            return res.redirect('/user-management');
        }
        req.flash('success', 'Account reactivated.');
        res.redirect('/user-management');
    });
});

// View / edit a single staff member's profile - SuperAdmin only (Jun Yuan)
app.get('/user-management/:id/edit', checkAuthenticated, checkSuperAdmin, (req, res) => {
    const staffId = req.params.id;
    const sql = 'SELECT staffId, fullName, email, role, phone, address, profilePicture, failedAttempts, isLocked FROM staff WHERE staffId = ?';
    db.query(sql, [staffId], (err, results) => {
        if (err) {
            console.error('Load staff profile error:', err);
            req.flash('error', 'Could not load that account. Please try again.');
            return res.redirect('/user-management');
        }
        if (results.length === 0) {
            req.flash('error', 'Staff account not found.');
            return res.redirect('/user-management');
        }
        res.render('editStaff', {
            user: req.session.user,
            staff: results[0],
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    });
});

// Reset a staff member's password as SuperAdmin - no current password required (Jun Yuan)
app.post('/user-management/:id/password', checkAuthenticated, checkSuperAdmin, (req, res) => {
    const staffId = req.params.id;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
        req.flash('error', 'Please fill in both password fields.');
        return res.redirect(`/user-management/${staffId}/edit`);
    }
    if (newPassword.length < 6) {
        req.flash('error', 'New password should be at least 6 characters long.');
        return res.redirect(`/user-management/${staffId}/edit`);
    }
    if (newPassword !== confirmPassword) {
        req.flash('error', 'New password and confirmation do not match.');
        return res.redirect(`/user-management/${staffId}/edit`);
    }

    const sql = 'UPDATE staff SET password = SHA1(?) WHERE staffId = ?';
    db.query(sql, [newPassword, staffId], (err, result) => {
        if (err) {
            console.error('Admin password reset error:', err);
            req.flash('error', 'Could not reset that password. Please try again.');
            return res.redirect(`/user-management/${staffId}/edit`);
        }
        if (result.affectedRows === 0) {
            req.flash('error', 'Staff account not found.');
            return res.redirect('/user-management');
        }
        req.flash('success', 'Password reset successfully.');
        res.redirect(`/user-management/${staffId}/edit`);
    });
});

// Manage Inventory: search/filter + stats, backed by the `ingredients` table - Manager/SuperAdmin only))
app.get('/manage-inventory', checkAuthenticated, checkManager, async (req, res) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';

        let sql = 'SELECT * FROM ingredients WHERE 1=1';
        const params = [];
        if (search) {
            sql += ' AND (ingredientName LIKE ? OR supplier LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }
        sql += ' ORDER BY ingredientName ASC';

        const [products] = await db.promise().query(sql, params);

        const [[{ totalIngredients }]] = await db.promise().query('SELECT COUNT(*) AS totalIngredients FROM ingredients');
        const [[{ lowStockCount }]] = await db.promise().query('SELECT COUNT(*) AS lowStockCount FROM ingredients WHERE quantity <= minimumStock');
        const [[{ expiringSoonCount }]] = await db.promise().query(`
            SELECT COUNT(*) AS expiringSoonCount
            FROM ingredients
            WHERE expiryDate >= CURDATE() AND expiryDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
        `);
        const [mostUsedRows] = await db.promise().query(`
            SELECT i.ingredientName, SUM(u.quantityUsed) AS totalUsed
            FROM ingredient_usage u
            JOIN ingredients i ON i.ingredientId = u.ingredientId
            GROUP BY u.ingredientId, i.ingredientName
            ORDER BY totalUsed DESC
            LIMIT 1
        `);
        const [categoryRows] = await db.promise().query(`
            SELECT categoryName
            FROM categories
            WHERE categoryName IS NOT NULL AND categoryName <> ''
            ORDER BY categoryName
        `);

        res.render('manageInventory', {
            user: req.session.user,
            staff: req.session.user,
            stats: {
                totalIngredients,
                lowStockCount,
                expiringSoonCount,
                mostUsedIngredient: mostUsedRows.length > 0 ? mostUsedRows[0].ingredientName : 'N/A'
            },
            search,
            category,
            categories: categoryRows.map(r => r.categoryName),
            ingredients: products,
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    } catch (error) {
        console.error('Manage inventory error:', error);
        req.flash('error', 'Could not load the inventory manager. Please try again.');
        res.redirect('/admin');
    }
});

const renderDeleteIngredientPage = (req, res, ingredientId) => {
    const sql = 'SELECT * FROM ingredients WHERE ingredientId = ?';

    db.query(sql, [ingredientId], (err, results) => {
        if (err) {
            console.error('Load delete ingredient error:', err);
            req.flash('error', 'Unable to load delete confirmation.');
            return res.redirect('/manage-inventory');
        }

        if (results.length === 0) {
            req.flash('error', 'Ingredient not found.');
            return res.redirect('/manage-inventory');
        }

        res.render('deleteOldIngredient', {
            user: req.session.user,
            ingredient: results[0],
            messages: req.flash('error')
        });
    });
};

// Delete ingredient confirmation page (Tong Sun)
app.get('/deleteOldIngredient/:id', checkAuthenticated, checkSuperAdmin, (req, res) => {
    renderDeleteIngredientPage(req, res, req.params.id);
});

// Delete ingredient route (Tong Sun)
app.post('/deleteOldIngredient/:id', checkAuthenticated, checkSuperAdmin, async (req, res) => {
    const ingredientId = req.params.id;

    const conn = db.promise();

    try {
        // Start transaction
        await conn.query('START TRANSACTION');

        // Delete dependent rows to avoid foreign-key constraint errors
        await conn.query('DELETE FROM ingredient_usage WHERE ingredientId = ?', [ingredientId]);
        await conn.query('DELETE FROM restock_requests WHERE ingredientId = ?', [ingredientId]);
        await conn.query('DELETE FROM expiry_requests WHERE ingredientId = ?', [ingredientId]);

        // Delete the ingredient
        const [result] = await conn.query('DELETE FROM ingredients WHERE ingredientId = ?', [ingredientId]);

        if (result.affectedRows === 0) {
            await conn.query('ROLLBACK');
            req.flash('error', 'Ingredient not found.');
            return res.redirect('/manage-inventory');
        }

        // Commit transaction
        await conn.query('COMMIT');

        req.flash('success', 'Ingredient deleted successfully.');
        return res.redirect('/manage-inventory');
    } catch (err) {
        try { await conn.query('ROLLBACK'); } catch (e) { /* ignore rollback errors */ }
        console.error('Delete ingredient error:', err);
        req.flash('error', 'Unable to delete the ingredient.');
        return res.redirect(`/deleteOldIngredient/${ingredientId}`);
    }
});

// Add new ingredient route (Tong Sun)
app.get('/addNewIngredient', checkAuthenticated, checkSuperAdmin, async (req, res) => {
    try {
        // Load categories from the `categories` table (categoryName column)
        const [categoryRows] = await db.promise().query(
            `SELECT categoryName FROM categories WHERE categoryName IS NOT NULL AND categoryName <> '' ORDER BY categoryName`
        );

        res.render('addNewIngredient', {
            user: req.session.user,
            messages: req.flash('error'),
            successMessages: req.flash('success'),
            categories: categoryRows.map(r => r.categoryName),
            formData: req.flash('formData')[0] || {}
        });
    } catch (error) {
        console.error('Load add ingredient page error:', error);
        req.flash('error', 'Unable to load the add ingredient page.');
        res.redirect('/manage-inventory');
    }
});

// Save New Ingredient details to database (Tong Sun)
app.post('/addNewIngredient', checkAuthenticated, checkSuperAdmin, ingredientUpload.single('image'), (req, res) => {
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim();
    const supplier = String(req.body.supplier || '').trim();
    const quantity = Number(req.body.quantity);
    const unit = String(req.body.unit || '').trim();
    const storageLocation = String(req.body.storageLocation || '').trim();
    const expiryDate = req.body.expiryDate ? String(req.body.expiryDate).trim() : null;
    const image = req.file ? req.file.filename : null;
    const createdBy = req.session.user && req.session.user.staffId ? req.session.user.staffId : null;
    const updatedBy = createdBy;

    if (!name || !category || !storageLocation || Number.isNaN(quantity) || quantity < 0) {
        req.flash('error', 'Please provide a valid name, category, storage location, and quantity.');
        req.flash('formData', { name, category, supplier, quantity: req.body.quantity, unit, storageLocation, expiryDate });
        return res.redirect('/addNewIngredient');
    }

    const insertSql = `
        INSERT INTO ingredients
        (ingredientName, category, supplier, quantity, unit, storageLocation, expiryDate, image, createdBy, updatedBy, minimumStock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    db.query(
        insertSql,
        [name, category, supplier, quantity, unit, storageLocation, expiryDate, image, createdBy, updatedBy],
        (err) => {
            if (err) {
                console.error('Add ingredient error:', err);
                req.flash('error', 'Unable to add the ingredient. Please try again.');
                req.flash('formData', { name, category, supplier, quantity: req.body.quantity, unit, storageLocation, expiryDate });
                return res.redirect('/addNewIngredient');
            }

            req.flash('success', 'Ingredient added successfully.');
            res.redirect('/manage-inventory');
        }
    );
});

// Update the changes made to an ingredient to the database (Tong Sun)
app.post('/updateIngredient/:id', checkAuthenticated, checkManager, ingredientUpload.single('image'), (req, res) => {
    const ingredientId = req.params.id;
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim();
    const supplier = String(req.body.supplier || '').trim();
    const quantity = Number(req.body.quantity);
    const unit = String(req.body.unit || '').trim();
    const storageLocation = String(req.body.storageLocation || '').trim();
    const expiryDate = req.body.expiryDate ? String(req.body.expiryDate).trim() : null;
    const oldImage = String(req.body.oldImage || '').trim();
    const image = req.file ? req.file.filename : oldImage || null;
    const updatedBy = req.session.user && req.session.user.staffId ? req.session.user.staffId : null;

    if (!name || !category || !storageLocation || Number.isNaN(quantity) || quantity < 0) {
        req.flash('error', 'Please provide a valid name, category, storage location, and quantity.');
        return res.redirect('/manage-inventory');
    }

    const updateSql = `
        UPDATE ingredients
        SET ingredientName = ?, category = ?, supplier = ?, quantity = ?, unit = ?, storageLocation = ?, expiryDate = ?, image = ?, updatedBy = ?
        WHERE ingredientId = ?
    `;

    db.query(
        updateSql,
        [name, category, supplier, quantity, unit, storageLocation, expiryDate, image, updatedBy, ingredientId],
        (err) => {
            if (err) {
                console.error('Update ingredient error:', err);
                req.flash('error', 'Unable to update the ingredient. Please try again.');
                return res.redirect('/manage-inventory');
            }

            req.flash('success', 'Ingredient updated successfully.');
            return res.redirect('/manage-inventory');
        }
    );
});

// Inventory board / Manager Dashboard: Total Ingredients Available - admin/superadmin only (rizq)
app.get('/board', checkAuthenticated, checkManager, (req, res) => {
    req.db.query('SELECT * FROM ingredients', (err, results) => {
        if (err) {
            console.error('Board error:', err);
            req.flash('error', 'Could not load the inventory board. Please try again.');
            return res.redirect('/dashboard');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Total ingredients available = sum of quantity across everything NOT expired.
        const totalAvailable = results.reduce((sum, item) => {
            const expiry = new Date(item.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            const isExpired = expiry < today;

            return isExpired ? sum : sum + Number(item.quantity || 0);
        }, 0);

        // Count how many ingredient records are expired.
        const expiredCount = results.filter((item) => {
            const expiry = new Date(item.expiryDate);
            expiry.setHours(0, 0, 0, 0);

            return expiry < today;
        }).length;

        // Count how many ingredient records are low stock.
        const lowStockCount = results.filter(
            (item) => Number(item.quantity) <= Number(item.minimumStock)
        ).length;

        // Expired ingredients = food waste.
        const foodWasteItems = results
            .filter((item) => {
                const expiry = new Date(item.expiryDate);
                expiry.setHours(0, 0, 0, 0);

                return expiry < today;
            })
            .map((item) => ({
                ingredientName: item.ingredientName,
                quantity: Number(item.quantity) || 0,
                unit: item.unit || ''
            }))
            .sort((a, b) => b.quantity - a.quantity);

        // Most / least used ingredients.
        req.db.query(
            `
            SELECT
                i.ingredientName,
                COALESCE(SUM(u.quantityUsed), 0) AS totalUsed
            FROM ingredients i
            LEFT JOIN ingredient_usage u
                ON u.ingredientId = i.ingredientId
            GROUP BY i.ingredientId, i.ingredientName
            ORDER BY totalUsed DESC
            `,
            (usageErr, usageRows) => {
                if (usageErr) {
                    console.error('Board usage error:', usageErr);
                    req.flash(
                        'error',
                        'Could not load ingredient usage stats. Please try again.'
                    );
                    return res.redirect('/dashboard');
                }

                const usedRows = usageRows.filter(
                    (row) => Number(row.totalUsed) > 0
                );

                const mostUsedIngredients = usedRows.slice(0, 5);
                const leastUsedIngredients = [...usedRows]
                    .reverse()
                    .slice(0, 5);

                // Pending expiry requests for managers to approve or reject.
                req.db.query(
                    `
                    SELECT
                        er.*,
                        i.ingredientName
                    FROM expiry_requests er
                    LEFT JOIN ingredients i
                        ON i.ingredientId = er.ingredientId
                    WHERE er.status = 'Pending'
                    ORDER BY er.createdAt DESC
                    `,
                    (pendingErr, pendingRows) => {
                        if (pendingErr) {
                            console.error(
                                'Board pending requests error:',
                                pendingErr
                            );

                            req.flash(
                                'error',
                                'Could not load pending expiry requests. Please try again.'
                            );

                            return res.redirect('/dashboard');
                        }

                        return res.render('board', {
                            user: req.session.user,
                            totalAvailable,
                            expiredCount,
                            lowStockCount,
                            foodWasteItems,
                            mostUsedIngredients,
                            leastUsedIngredients,
                            pendingExpiryRequests: pendingRows,
                            successMessages: req.flash('success'),
                            errorMessages: req.flash('error')
                        });
                    }
                );
            }
        );
    });
});


// Approve expiry request
app.post(
    '/expiryrequests/:id/approve',
    checkAuthenticated,
    checkManager,
    (req, res) => {
        const requestId = Number(req.params.id);

        if (!Number.isInteger(requestId)) {
            req.flash('error', 'Invalid expiry request.');
            return res.redirect('/board');
        }

        req.db.query(
            `
            UPDATE expiry_requests
            SET status = 'Approved'
            WHERE requestId = ?
              AND status = 'Pending'
            `,
            [requestId],
            (error, result) => {
                if (error) {
                    console.error('Approve expiry request error:', error);
                    req.flash(
                        'error',
                        'Unable to approve the expiry request.'
                    );
                    return res.redirect('/board');
                }

                if (result.affectedRows === 0) {
                    req.flash(
                        'error',
                        'Request not found or already processed.'
                    );
                    return res.redirect('/board');
                }

                req.flash(
                    'success',
                    'Expiry request approved successfully.'
                );

                return res.redirect('/board');
            }
        );
    }
);


// Reject expiry request
app.post(
    '/expiryrequests/:id/reject',
    checkAuthenticated,
    checkManager,
    (req, res) => {
        const requestId = Number(req.params.id);

        if (!Number.isInteger(requestId)) {
            req.flash('error', 'Invalid expiry request.');
            return res.redirect('/board');
        }

        req.db.query(
            `
            UPDATE expiry_requests
            SET status = 'Rejected'
            WHERE requestId = ?
              AND status = 'Pending'
            `,
            [requestId],
            (error, result) => {
                if (error) {
                    console.error('Reject expiry request error:', error);
                    req.flash(
                        'error',
                        'Unable to reject the expiry request.'
                    );
                    return res.redirect('/board');
                }

                if (result.affectedRows === 0) {
                    req.flash(
                        'error',
                        'Request not found or already processed.'
                    );
                    return res.redirect('/board');
                }

                req.flash(
                    'success',
                    'Expiry request rejected successfully.'
                );

                return res.redirect('/board');
            }
        );
    }
);
// ============================================
// SEARCH & FILTER ROUTE (Tara)
// ============================================
app.get('/search', requireLogin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';
        const storage = req.query.storage || '';
        const expiry = req.query.expiry || '';
        const sort = req.query.sort || '';

        let sql = `
            SELECT *,
                   DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
            FROM ingredients
            WHERE 1 = 1
        `;

        const params = [];

        // Search using the ingredient name
        if (search) {
            sql += ` AND ingredientName LIKE ?`;
            params.push(`%${search}%`);
        }

        // Filter using category
        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }

        // Filter using storage location
        if (storage) {
            sql += ` AND storageLocation = ?`;
            params.push(storage);
        }

        // Filter using expiry status
        if (expiry === 'expired') {
            sql += ` AND expiryDate < CURDATE()`;
        } else if (expiry === '3days') {
            sql += `
                AND expiryDate BETWEEN CURDATE()
                AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
            `;
        } else if (expiry === '7days') {
            sql += `
                AND expiryDate BETWEEN CURDATE()
                AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            `;
        }

        // Sort results
        if (sort === 'expiry_desc') {
            sql += ` ORDER BY expiryDate DESC`;
        } else if (sort === 'name_asc') {
            sql += ` ORDER BY ingredientName ASC`;
        } else if (sort === 'newest') {
            sql += ` ORDER BY createdAt DESC`;
        } else {
            sql += ` ORDER BY expiryDate ASC`;
        }

        const [items] = await db.promise().query(sql, params);

        // Get category options for the dropdown
        const [categoryRows] = await db.promise().query(`
            SELECT DISTINCT category
            FROM ingredients
            WHERE category IS NOT NULL
              AND category <> ''
            ORDER BY category
        `);

        // Get storage-location options for the dropdown
        const [storageRows] = await db.promise().query(`
            SELECT DISTINCT storageLocation
            FROM ingredients
            WHERE storageLocation IS NOT NULL
              AND storageLocation <> ''
            ORDER BY storageLocation
        `);

        res.render('search', {
            user: req.session.user,
            items,
            categories: categoryRows.map(row => row.category),
            storageOptions: storageRows.map(row => row.storageLocation),
            search,
            selectedCategory: category,
            selectedStorage: storage,
            selectedExpiry: expiry,
            selectedSort: sort
        });

    } catch (error) {
        console.error('Search error:', error);

        req.flash(
            'error',
            'Something went wrong while searching. Please try again.'
        );

        return res.redirect('/dashboard');
    }
});


// ============================================
// EXPIRING SOON ROUTE (Tara)
// ============================================
app.get('/expiring', requireLogin, async (req, res) => {
    try {
        const sql = `
            SELECT *,
                   DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
            FROM ingredients
            WHERE expiryDate <= DATE_ADD(
                CURDATE(),
                INTERVAL 3 DAY
            )
            ORDER BY expiryDate ASC
        `;

        const [items] = await db.promise().query(sql);

        res.render('expiring', {
            user: req.session.user,
            items
        });

    } catch (error) {
        console.error('Expiring error:', error);

        req.flash(
            'error',
            'Something went wrong loading expiring items. Please try again.'
        );

        return res.redirect('/dashboard');
    }
});
// Logout route (Jun Yuan)
app.get('/logout', (req, res) => {
req.session.destroy();
res.redirect('/');
});

// Profile page  (Jun Yuan)
app.get('/profile', checkAuthenticated, (req, res) => {
    const sql = 'SELECT staffId, fullName, email, role, phone, address, profilePicture FROM staff WHERE staffId = ?';
    db.query(sql, [req.session.user.staffId], (err, results) => {
        if (err) {
            console.error('Profile load error:', err);
            req.flash('error', 'Could not load your profile. Please try again.');
            return res.redirect('/');
        }
        if (results.length === 0) {
            req.flash('error', 'Your account could not be found.');
            return res.redirect('/');
        }
        res.render('profile', {
            profile: results[0],
            user: req.session.user,
            messages: req.flash('error'),
            successMessages: req.flash('success')
        });
    });
});

// Update the optional contact details (Jun Yuan)
app.post('/profile/contact', checkAuthenticated, (req, res) => {
    const phone = (req.body.phone || '').trim() || null;
    const address = (req.body.address || '').trim() || null;

    const sql = 'UPDATE staff SET phone = ?, address = ? WHERE staffId = ?';
    db.query(sql, [phone, address, req.session.user.staffId], (err) => {
        if (err) {
            console.error('Update contact info error:', err);
            req.flash('error', 'Could not update your contact details. Please try again.');
            return res.redirect('/profile');
        }
        req.session.user.phone = phone;
        req.session.user.address = address;
        req.flash('success', 'Contact details updated.');
        res.redirect('/profile');
    });
});

// Update the profile picture (Jun Yuan)
app.post('/profile/picture', checkAuthenticated, (req, res) => {
    profileUpload.single('profilePicture')(req, res, (uploadErr) => {
        if (uploadErr) {
            console.error('Profile picture upload error:', uploadErr);
            req.flash('error', 'Could not upload that file. Please try again.');
            return res.redirect('/profile');
        }
        if (!req.file) {
            req.flash('error', 'Please choose a JPG, PNG, or GIF image under 5MB.');
            return res.redirect('/profile');
        }

        const sql = 'UPDATE staff SET profilePicture = ? WHERE staffId = ?';
        db.query(sql, [req.file.filename, req.session.user.staffId], (err) => {
            if (err) {
                console.error('Update profile picture error:', err);
                req.flash('error', 'Could not save your new photo. Please try again.');
                return res.redirect('/profile');
            }
            req.session.user.profilePicture = req.file.filename;
            req.flash('success', 'Profile picture updated.');
            res.redirect('/profile');
        });
    });
});

// Change password  (Jun Yuan)
app.post('/profile/password', checkAuthenticated, (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
        req.flash('error', 'Please fill in all three password fields.');
        return res.redirect('/profile');
    }
    if (newPassword.length < 6) {
        req.flash('error', 'New password should be at least 6 characters long.');
        return res.redirect('/profile');
    }
    if (newPassword !== confirmPassword) {
        req.flash('error', 'New password and confirmation do not match.');
        return res.redirect('/profile');
    }

    const checkSql = 'SELECT staffId FROM staff WHERE staffId = ? AND password = SHA1(?)';
    db.query(checkSql, [req.session.user.staffId, currentPassword], (err, results) => {
        if (err) {
            console.error('Change password error:', err);
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect('/profile');
        }
        if (results.length === 0) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/profile');
        }

        const updateSql = 'UPDATE staff SET password = SHA1(?) WHERE staffId = ?';
        db.query(updateSql, [newPassword, req.session.user.staffId], (err2) => {
            if (err2) {
                console.error('Change password error:', err2);
                req.flash('error', 'Could not update your password. Please try again.');
                return res.redirect('/profile');
            }
            // Password changed - log the user out so they have to sign back in with it (Jun Yuan)
            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    console.error('Session destroy after password change error:', destroyErr);
                }
                res.redirect('/login?passwordChanged=1');
            });
        });
    });
});

// Dashboard route - chef only (Tassie) with Search/Filter dropdowns (Tara)
// =====================================================
// KITCHEN DASHBOARD AND EXPIRY MONITORING
// =====================================================

// Check whether the user is logged in
function requireKitchenLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        req.flash('error', 'Please log in first.');
        return res.redirect('/login');
    }

    next();
}


// Allow chefs and managers to access the pages
function allowKitchenAccess(req, res, next) {
    const role = req.session.user.role;

    if (role === 'Chef' || role === 'Manager') {
        return next();
    }

    req.flash(
        'error',
        'You do not have permission to access this page.'
    );

    res.redirect('/');
}


// Helper function for MySQL queries
function runQuery(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (error, results) => {
            if (error) {
                reject(error);
            } else {
                resolve(results);
            }
        });
    });
}


// =====================================================
// KITCHEN DASHBOARD AND EXPIRY MONITORING (Tassie)
// =====================================================

// Helper function for database queries
function runQuery(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, values, (error, results) => {
            if (error) {
                return reject(error);
            }

            resolve(results);
        });
    });
}


// Safely add backticks around database column names
function quoteIdentifier(identifier) {
    return `\`${String(identifier).replace(/`/g, '``')}\``;
}


// Find the correct column name inside the ingredients table
function findColumn(columnNames, possibleNames, required = true) {
    const match = possibleNames.find(name =>
        columnNames.includes(name)
    );

    if (!match && required) {
        throw new Error(
            `The ingredients table is missing one of these columns: ${possibleNames.join(', ')}`
        );
    }

    return match || null;
}


// Check the actual column names inside ingredients
async function getIngredientColumnMap() {
    const columns = await runQuery(
        'SHOW COLUMNS FROM ingredients'
    );

    const names = columns.map(column => column.Field);

    return {
        id: findColumn(names, [
            'ingredientId',
            'ingredientID',
            'ingredient_id',
            'id'
        ]),

        name: findColumn(names, [
            'ingredientName',
            'ingredient_name',
            'name'
        ]),

        quantity: findColumn(names, [
            'quantity',
            'stockQuantity',
            'stock_quantity',
            'currentStock',
            'current_stock',
            'stock'
        ]),

        unit: findColumn(
            names,
            [
                'unit',
                'measurementUnit',
                'measurement_unit'
            ],
            false
        ),

        minimumStock: findColumn(
            names,
            [
                'minimumStock',
                'minimum_stock',
                'minStock',
                'min_stock',
                'reorderLevel',
                'reorder_level'
            ],
            false
        ),

        expiryDate: findColumn(names, [
            'expiryDate',
            'expiry_date',
            'expirationDate',
            'expiration_date'
        ])
    };
}


// Load all ingredients using the real table columns
async function loadIngredients() {
    const columns = await getIngredientColumnMap();

    const selectParts = [
        `${quoteIdentifier(columns.id)} AS ingredientId`,

        `${quoteIdentifier(columns.name)} AS ingredientName`,

        `${quoteIdentifier(columns.quantity)} AS quantity`,

        columns.unit
            ? `${quoteIdentifier(columns.unit)} AS unit`
            : `'unit' AS unit`,

        columns.minimumStock
            ? `${quoteIdentifier(columns.minimumStock)} AS minimumStock`
            : `10 AS minimumStock`,

        `${quoteIdentifier(columns.expiryDate)} AS expiryDate`
    ];

    const rows = await runQuery(`
        SELECT ${selectParts.join(', ')}
        FROM ingredients
        ORDER BY ${quoteIdentifier(columns.name)} ASC
    `);

    return rows.map(item => {
        const quantity = Number(item.quantity || 0);

        const minimumStock =
            Number(item.minimumStock || 10);

        let daysRemaining = null;
        let expiryStatus = 'No Expiry Date';

        if (item.expiryDate) {
            const today = new Date();
            const expiry = new Date(item.expiryDate);

            today.setHours(0, 0, 0, 0);
            expiry.setHours(0, 0, 0, 0);

            daysRemaining = Math.round(
                (
                    expiry.getTime() -
                    today.getTime()
                ) /
                (1000 * 60 * 60 * 24)
            );

            if (daysRemaining < 0) {
                expiryStatus = 'Expired';
            } else if (daysRemaining <= 7) {
                expiryStatus = 'Expiring Soon';
            } else {
                expiryStatus = 'Safe';
            }
        }

        return {
            ...item,

            quantity,

            minimumStock,

            daysRemaining,

            daysExpired:
                daysRemaining !== null &&
                daysRemaining < 0
                    ? Math.abs(daysRemaining)
                    : 0,

            expiryStatus,

            isLowStock:
                quantity <= minimumStock
        };
    });
}


// Load expiry requests and match them with ingredients
async function loadExpiryRequests() {
    const requests = await runQuery(`
        SELECT *
        FROM expiry_requests
        ORDER BY createdAt DESC
    `);

    const ingredients = await loadIngredients();

    const ingredientMap = new Map(
        ingredients.map(item => [
            String(item.ingredientId),
            item
        ])
    );

    return requests.map(request => {
        const ingredient = ingredientMap.get(
            String(request.ingredientId)
        );

        return {
            ...request,

            ingredientName:
                ingredient
                    ? ingredient.ingredientName
                    : 'Unknown Ingredient',

            unit:
                ingredient
                    ? ingredient.unit
                    : ''
        };
    });
}


// Create expiry_requests table automatically
db.query(
    `
        CREATE TABLE IF NOT EXISTS expiry_requests (
            requestId INT AUTO_INCREMENT PRIMARY KEY,

            ingredientId INT NOT NULL,

            requestedBy VARCHAR(150) NOT NULL,

            requestType VARCHAR(80) NOT NULL,

            requestedQuantity DECIMAL(10,2) NOT NULL,

            priority VARCHAR(30)
                NOT NULL
                DEFAULT 'Normal',

            reason VARCHAR(500) NOT NULL,

            status VARCHAR(30)
                NOT NULL
                DEFAULT 'Pending',

            createdAt TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            updatedAt TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP
        )
    `,
    error => {
        if (error) {
            console.error(
                'Unable to prepare expiry_requests table:',
                error.message
            );
        }
    }
);


// Chef homepage - lands here after login, mirrors the admin.ejs welcome page (TASSIE)
// The full kitchen operations view (tasks, alerts, expiry requests) lives at /dashboard/overview below.
app.get('/dashboard', requireLogin, checkChef, (req, res) => {
    res.render('chef', { user: req.session.user });
});

// =====================================================
// KITCHEN OPERATIONS DASHBOARD
// =====================================================
app.get(
    '/dashboard/overview',
    checkAuthenticated,
    async (req, res) => {
        try {
            const ingredients = await loadIngredients();
            const expiryRequests = await loadExpiryRequests();

            // ==================[ TARA ]==================
            // Search & Filter widget
            // Runs only when the widget's form has actually been submitted,
            // so the dashboard looks the same as before until a search/filter
            // is applied.
            const search = req.query.search || '';
            const filterCategory = req.query.category || '';
            const filterStorage = req.query.storage || '';
            const filterExpiry = req.query.expiry || '';
            const filterStock = req.query.stock || '';
            const sort = req.query.sort || '';

            const hasSearchOrFilter = !!(
                search || filterCategory || filterStorage ||
                filterExpiry || filterStock || sort
            );

            let searchResults = null;

            if (hasSearchOrFilter) {
                let sql = `
                    SELECT *, DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
                    FROM ingredients
                    WHERE 1=1
                `;
                const params = [];

                if (search) {
                    sql += ` AND ingredientName LIKE ?`;
                    params.push(`%${search}%`);
                }
                if (filterCategory) {
                    sql += ` AND category = ?`;
                    params.push(filterCategory);
                }
                if (filterStorage) {
                    sql += ` AND storageLocation = ?`;
                    params.push(filterStorage);
                }
                if (filterExpiry === 'expired') {
                    sql += ` AND expiryDate < CURDATE()`;
                } else if (filterExpiry === '3days') {
                    sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)`;
                } else if (filterExpiry === '7days') {
                    sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
                } else if (filterExpiry === '30days') {
                    sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
                }
                if (filterStock === 'low') {
                    sql += ` AND quantity <= minimumStock`;
                }

                if (sort === 'expiry_desc') {
                    sql += ` ORDER BY expiryDate DESC`;
                } else if (sort === 'name_asc') {
                    sql += ` ORDER BY ingredientName ASC`;
                } else if (sort === 'newest') {
                    sql += ` ORDER BY createdAt DESC`;
                } else {
                    sql += ` ORDER BY expiryDate ASC`; // default: expiry_asc
                }

                const [rows] = await db.promise().query(sql, params);
                searchResults = rows;
            }
            // ================[ END TARA ]================

            const [categoryRows] = await db.promise().query(
                `SELECT categoryId, categoryName FROM categories ORDER BY categoryName ASC`
            );
            const [storageRows] = await db.promise().query(
                `SELECT DISTINCT storageLocation FROM ingredients WHERE storageLocation IS NOT NULL ORDER BY storageLocation`
            );

            // Load kitchen tasks from MySQL
           const kitchenTasks = await runQuery(`
            SELECT
                taskId,
                taskName,
                taskDate,
                status,
                assignedTo
            FROM kitchen_tasks
            ORDER BY
                FIELD(status, 'Pending', 'Completed'),
                taskDate DESC,
                taskId DESC
        `);

console.log('KITCHEN TASKS LOADED:', kitchenTasks);
console.log('TASKS SENT TO DASHBOARD:', kitchenTasks);

            // Ingredients that expired before today
            const expiredIngredients = ingredients
                .filter(item =>
                    item.daysRemaining !== null &&
                    item.daysRemaining < 0
                )
                .sort((a, b) =>
                    a.daysRemaining - b.daysRemaining
                );

            // Ingredients expiring today
            const expiringTodayIngredients = ingredients
                .filter(item =>
                    item.daysRemaining === 0
                )
                .sort((a, b) =>
                    a.ingredientName.localeCompare(
                        b.ingredientName
                    )
                );

            // Ingredients expiring within the next 7 days
            const expiringSoonIngredients = ingredients
                .filter(item =>
                    item.daysRemaining !== null &&
                    item.daysRemaining > 0 &&
                    item.daysRemaining <= 7
                )
                .sort((a, b) =>
                    a.daysRemaining - b.daysRemaining
                );

            // Low-stock ingredients
            const lowStockIngredients = ingredients
                .filter(item => item.isLowStock)
                .sort((a, b) =>
                    a.quantity - b.quantity
                );

            // Build kitchen alerts
            const kitchenAlerts = [];

            expiringTodayIngredients.forEach(item => {
                kitchenAlerts.push({
                    type: 'danger',
                    message:
                        `${item.ingredientName} expires today.`
                });
            });

            expiredIngredients.forEach(item => {
                kitchenAlerts.push({
                    type: 'danger',
                    message:
                        `${item.ingredientName} has expired.`
                });
            });

            lowStockIngredients.forEach(item => {
                kitchenAlerts.push({
                    type: 'warning',
                    message:
                        `${item.ingredientName} is low in stock.`
                });
            });

            expiringSoonIngredients.forEach(item => {
                kitchenAlerts.push({
                    type: 'info',
                    message:
                        `${item.ingredientName} expires in ` +
                        `${item.daysRemaining} day(s).`
                });
            });

            res.render('dashboard', {
                user: req.session.user,

                kitchenTasks: kitchenTasks,

                expiredIngredients:
                    expiredIngredients.slice(0, 5),

                expiringTodayIngredients:
                    expiringTodayIngredients.slice(0, 5),

                expiringSoonIngredients:
                    expiringSoonIngredients.slice(0, 5),

                expiredCount:
                    expiredIngredients.length,

                expiringTodayCount:
                    expiringTodayIngredients.length,

                expiringSoonCount:
                    expiringSoonIngredients.length,

                kitchenAlerts:
                    kitchenAlerts.slice(0, 6),

                recentRequests:
                    expiryRequests.slice(0, 5),

                // ==================[ TARA ]==================
                // Search & Filter widget data
                searchResults,
                categories: categoryRows.map(r => r.categoryName),
                categoryList: categoryRows,
                storageOptions: storageRows.map(r => r.storageLocation),
                searchTerm: search,
                selectedCategory: filterCategory,
                selectedStorage: filterStorage,
                selectedExpiry: filterExpiry,
                selectedStock: filterStock,
                selectedSort: sort,
                // ================[ END TARA ]================

                successMessages:
                    req.flash('success'),

                errorMessages:
                    req.flash('error')
            });

        } catch (error) {
            console.error(
                'Kitchen dashboard database error:',
                error
            );

            res.status(500).send(`
                <div style="
                    font-family: Arial;
                    padding: 40px;
                ">
                    <h1>Kitchen dashboard error</h1>
                    <p>${error.message}</p>
                    <a href="/">Return to home page</a>
                </div>
            `);
        }
    }
);

// =====================================================
// CREATE KITCHEN TASK
// =====================================================
app.post(
    '/kitchen-tasks',
    checkAuthenticated,
    async (req, res) => {
        try {
            const taskName = String(
                req.body.taskName || ''
            ).trim();

            const taskDate = String(
                req.body.taskDate || ''
            ).trim();

            if (!taskName || !taskDate) {
                req.flash(
                    'error',
                    'Please enter a task name and task date.'
                );

                return res.redirect('/dashboard/overview');
            }

            const assignedTo =
                req.session.user.fullName ||
                req.session.user.username ||
                req.session.user.email ||
                'Chef';

            const result = await runQuery(
                `
                    INSERT INTO kitchen_tasks (
                        taskName,
                        taskDate,
                        status,
                        assignedTo
                    )
                    VALUES (?, ?, 'Pending', ?)
                `,
                [
                    taskName,
                    taskDate,
                    assignedTo
                ]
            );

            console.log(
                'Kitchen task created:',
                result
            );

            req.flash(
                'success',
                'Kitchen task created successfully.'
            );

            return res.redirect('/dashboard/overview');

        } catch (error) {
            console.error(
                'Create kitchen task error:',
                error
            );

            req.flash(
                'error',
                'Unable to create the kitchen task.'
            );

            return res.redirect('/dashboard/overview');
        }
    }
);
// =====================================================
// EDIT KITCHEN TASK
// =====================================================
app.post(
    '/kitchen-tasks/:id/edit',
    checkAuthenticated,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);

            const taskName = String(
                req.body.taskName || ''
            ).trim();

            const taskDate = String(
                req.body.taskDate || ''
            ).trim();

            const assignedTo = String(
                req.body.assignedTo || ''
            ).trim();

            if (
                !Number.isInteger(taskId) ||
                !taskName ||
                !taskDate ||
                !assignedTo
            ) {
                req.flash(
                    'error',
                    'Please complete all task fields correctly.'
                );

                return res.redirect('/dashboard/overview');
            }

            const result = await runQuery(
                `
                    UPDATE kitchen_tasks
                    SET
                        taskName = ?,
                        taskDate = ?,
                        assignedTo = ?
                    WHERE taskId = ?
                `,
                [
                    taskName,
                    taskDate,
                    assignedTo,
                    taskId
                ]
            );

            if (result.affectedRows === 0) {
                req.flash(
                    'error',
                    'Kitchen task was not found.'
                );

                return res.redirect('/dashboard/overview');
            }

            req.flash(
                'success',
                'Kitchen task updated successfully.'
            );

            return res.redirect('/dashboard/overview');

        } catch (error) {
            console.error(
                'Edit kitchen task error:',
                error
            );

            req.flash(
                'error',
                'Unable to update the kitchen task.'
            );

            return res.redirect('/dashboard/overview');
        }
    }
);
// =====================================================
// DELETE KITCHEN TASK
// =====================================================
app.post(
    '/kitchen-tasks/:id/delete',
    checkAuthenticated,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);

            if (!Number.isInteger(taskId)) {
                req.flash(
                    'error',
                    'Invalid kitchen task.'
                );

                return res.redirect('/dashboard/overview');
            }

            const result = await runQuery(
                `
                    DELETE FROM kitchen_tasks
                    WHERE taskId = ?
                `,
                [taskId]
            );

            if (result.affectedRows === 0) {
                req.flash(
                    'error',
                    'Kitchen task was not found.'
                );

                return res.redirect('/dashboard/overview');
            }

            req.flash(
                'success',
                'Kitchen task deleted successfully.'
            );

            return res.redirect('/dashboard/overview');

        } catch (error) {
            console.error(
                'Delete kitchen task error:',
                error
            );

            req.flash(
                'error',
                'Unable to delete the kitchen task.'
            );

            return res.redirect('/dashboard/overview');
        }
    }
);



// =====================================================
// UPDATE KITCHEN TASK STATUS
// =====================================================
app.post(
    '/kitchen-tasks/:id/toggle',
    checkAuthenticated,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);

            if (!Number.isInteger(taskId)) {
                req.flash(
                    'error',
                    'Invalid kitchen task.'
                );

                return res.redirect('/dashboard/overview');
            }

            await runQuery(
                `
                    UPDATE kitchen_tasks
                    SET status =
                        CASE
                            WHEN status = 'Pending'
                                THEN 'Completed'
                            ELSE 'Pending'
                        END
                    WHERE taskId = ?
                `,
                [taskId]
            );

            req.flash(
                'success',
                'Kitchen task status updated.'
            );

            return res.redirect('/dashboard/overview');

        } catch (error) {
            console.error(
                'Kitchen task update error:',
                error
            );

            req.flash(
                'error',
                'Unable to update the kitchen task.'
            );

            return res.redirect('/dashboard/overview');
        }
    }
);


// =====================================================
// EXPIRY MONITORING
// =====================================================
app.get('/expirymonitoring', checkAuthenticated, async (req, res) => {
    try {
        // Values entered in the search/filter form
        const search = (req.query.search || '').trim();
        const selectedStatus = req.query.status || 'all';

        // Get all ingredients using your existing helper
        const ingredients = await loadIngredients();

        // Search by ingredient name
        let items = ingredients.filter((item) => {
            const ingredientName = item.ingredientName || '';

            return ingredientName
                .toLowerCase()
                .includes(search.toLowerCase());
        });

        // Filter by expiry status
        if (selectedStatus === 'expired') {
            items = items.filter(
                (item) => item.expiryStatus === 'Expired'
            );
        }

        if (selectedStatus === 'soon') {
            items = items.filter(
                (item) => item.expiryStatus === 'Expiring Soon'
            );
        }

        if (selectedStatus === 'safe') {
            items = items.filter(
                (item) => item.expiryStatus === 'Safe'
            );
        }

        // Display expirymonitoring.ejs
        res.render('expirymonitoring', {
            user: req.session.user,

            search: search,
            selectedStatus: selectedStatus,
            items: items,

            successMessages: req.flash('success'),
            errorMessages: req.flash('error')
        });

    } catch (error) {
        console.error(
            'Expiry monitoring database error:',
            error
        );

        req.flash(
            'error',
            'Unable to load expiry monitoring.'
        );

        res.redirect('/dashboard/overview');
    }
});
//=================================================
// VIEW EXPIRY REQUESTS
// =====================================================
app.get(
    '/expiryrequests',
    checkAuthenticated,
    async (req, res) => {
        try {
            const requests =
                await loadExpiryRequests();

            res.render(
                'expiryrequests',
                {
                    user:
                        req.session.user,

                    requests,

                    successMessages:
                        req.flash('success'),

                    errorMessages:
                        req.flash('error')
                }
            );
        } catch (error) {
            console.error(
                'Expiry request page error:',
                error
            );

            req.flash(
                'error',
                'Unable to load expiration stock requests.'
            );

            res.redirect('/dashboard/overview');
        }
    }
);


// =====================================================
// SHOW NEW REQUEST FORM
// =====================================================
app.get('/expiryrequests/new', checkAuthenticated, async (req, res) => {

    try {

        const ingredients = await loadIngredients();

        const expiringIngredients = ingredients.filter(item =>
            item.expiryStatus === 'Expired' ||
            item.expiryStatus === 'Expiring Soon'
        );

        res.render('newexpiryrequest', {
            user: req.session.user,
            ingredients: expiringIngredients,
            errorMessages: req.flash('error')
        });

    } catch (error) {

        console.error(error);

        req.flash('error', 'Unable to load page.');

        res.redirect('/dashboard/overview');

    }

});



// =====================================================
// SUBMIT NEW EXPIRY REQUEST
// =====================================================
app.post(
    '/expiryrequests',
    checkAuthenticated,
    async (req, res) => {
        try {
            const ingredientId =
                String(
                    req.body.ingredientId || ''
                ).trim();

            const requestType =
                String(
                    req.body.requestType || ''
                ).trim();

            const requestedQuantity =
                Number(
                    req.body.requestedQuantity
                );

            const priority =
                String(
                    req.body.priority || ''
                ).trim();

            const reason =
                String(
                    req.body.reason || ''
                ).trim();

            const allowedRequestTypes = [
                'Replace Expired Stock',
                'Top Up Expiring Stock'
            ];

            const allowedPriorities = [
                'Normal',
                'High',
                'Urgent'
            ];

            if (
                !ingredientId ||
                !allowedRequestTypes.includes(
                    requestType
                ) ||
                !Number.isFinite(
                    requestedQuantity
                ) ||
                requestedQuantity <= 0 ||
                !allowedPriorities.includes(
                    priority
                ) ||
                !reason
            ) {
                req.flash(
                    'error',
                    'Please complete all fields correctly.'
                );

                return res.redirect(
                    '/expiryrequests/new'
                );
            }

            const ingredients =
                await loadIngredients();

            const selectedIngredient =
                ingredients.find(
                    item =>
                        String(
                            item.ingredientId
                        ) === ingredientId
                );

            if (!selectedIngredient) {
                req.flash(
                    'error',
                    'The selected ingredient does not exist.'
                );

                return res.redirect(
                    '/expiryrequests/new'
                );
            }

            const requestedBy =
                req.session.user.fullName ||
                req.session.user.email ||
                req.session.user.username ||
                'Unknown User';

            await runQuery(
                `
                    INSERT INTO expiry_requests (
                        ingredientId,
                        requestedBy,
                        requestType,
                        requestedQuantity,
                        priority,
                        reason,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'Pending')
                `,
                [
                    ingredientId,
                    requestedBy,
                    requestType,
                    requestedQuantity,
                    priority,
                    reason
                ]
            );

            req.flash(
                'success',
                'Expiration stock request submitted successfully.'
            );

            return res.redirect(
                '/expiryrequests'
            );
        } catch (error) {
            console.error(
                'Create expiry request error:',
                error
            );

            req.flash(
                'error',
                'Unable to submit the expiration stock request.'
            );

            return res.redirect(
                '/expiryrequests/new'
            );
        }
    }
);


// =====================================================
// ==================[ TARA ]====================
// CATEGORY MANAGEMENT
// The search/filter widget on the Kitchen Operations dashboard also reads
// from this table to populate its Category dropdown.
// =====================================================

// NOTE: Category management now lives inline on the Kitchen Operations
// dashboard (/dashboard/overview) as Add/Edit/Delete modals, using the
// categoryList data already loaded there. The old standalone GET pages
// (category.ejs, newcategory.ejs, updatecategory.ejs, deletecategory.ejs)
// are no longer linked to, so their GET routes have been removed. The
// POST routes below are unchanged in behaviour, but now redirect back to
// the dashboard instead of the old standalone pages.

// [POST] Create a new category
app.post('/categories/new', checkAuthenticated, async (req, res) => {
    const categoryName = String(req.body.categoryName || '').trim();

    if (!categoryName) {
        req.flash('error', 'Category name is required.');
        req.flash('formData', req.body);
        return res.redirect('/dashboard/overview');
    }

    try {
        await db.promise().query(
            `INSERT INTO categories (categoryName) VALUES (?)`,
            [categoryName]
        );
        req.flash('success', 'Category added successfully.');
        res.redirect('/dashboard/overview');
    } catch (error) {
        console.error('Add category error:', error);
        const message = error.code === 'ER_DUP_ENTRY'
            ? 'That category already exists.'
            : 'Unable to add the category. Please try again.';
        req.flash('error', message);
        req.flash('formData', req.body);
        res.redirect('/dashboard/overview');
    }
});

// [POST] Save changes to a category
app.post('/categories/:id/edit', checkAuthenticated, async (req, res) => {
    const categoryName = String(req.body.categoryName || '').trim();
    const categoryId = req.params.id;

    if (!categoryName) {
        req.flash('error', 'Category name is required.');
        return res.redirect('/dashboard/overview');
    }

    try {
        await db.promise().query(
            `UPDATE categories SET categoryName = ? WHERE categoryId = ?`,
            [categoryName, categoryId]
        );
        req.flash('success', 'Category updated successfully.');
        res.redirect('/dashboard/overview');
    } catch (error) {
        console.error('Update category error:', error);
        const message = error.code === 'ER_DUP_ENTRY'
            ? 'That category already exists.'
            : 'Unable to update the category. Please try again.';
        req.flash('error', message);
        res.redirect('/dashboard/overview');
    }
});

// [POST] Delete a category
app.post('/categories/:id/delete', checkAuthenticated, async (req, res) => {
    try {
        const [result] = await db.promise().query(
            `DELETE FROM categories WHERE categoryId = ?`,
            [req.params.id]
        );
        if (result.affectedRows === 0) {
            req.flash('error', 'Category not found.');
        } else {
            req.flash('success', 'Category deleted successfully.');
        }
        res.redirect('/dashboard/overview');
    } catch (error) {
        console.error('Delete category error:', error);
        req.flash('error', 'Unable to delete the category.');
        res.redirect('/dashboard/overview');
    }
});
// ================[ END TARA ]================

// [GET] Display Ingredient Usage Form (Sean)
app.get('/ingredient-usage', checkAuthenticated, checkManagerOrChef, (req, res) => {

    const sql = `
        SELECT
            ingredientId,
            ingredientName,
            quantity,
            unit
        FROM ingredients
        ORDER BY ingredientName ASC
    `;

    req.db.query(sql, (err, ingredients) => {

        if (err) {
            console.error(err);
            req.flash('error', 'Unable to load ingredients.');
            return res.redirect('/dashboard/overview');
        }

        res.render('ingredientusage', {
            user: req.session.user,
            ingredients,
            messages: req.flash('success'),
            errors: req.flash('error')
        });

    });

});


// [POST] Record Ingredient Usage, Update Inventory & Create Restocking Request (Sean)
app.post('/ingredient-usage', checkAuthenticated, checkManagerOrChef, (req, res) => {

    const ingredientId = req.body.ingredientId;
    const quantityUsed = parseFloat(req.body.quantityUsed);
    const remarks = req.body.remarks;
    const staffId = req.session.user.staffId;

    if (!ingredientId || isNaN(quantityUsed) || quantityUsed <= 0) {
        req.flash('error', 'Please enter a valid quantity.');
        return res.redirect('/ingredient-usage');
    }

    const ingredientSQL = `
        SELECT *
        FROM ingredients
        WHERE ingredientId = ?
    `;

    req.db.query(ingredientSQL, [ingredientId], (err, ingredientResult) => {

        if (err) {
            console.error(err);
            req.flash('error', 'Database error.');
            return res.redirect('/ingredient-usage');
        }

        if (ingredientResult.length === 0) {
            req.flash('error', 'Ingredient not found.');
            return res.redirect('/ingredient-usage');
        }

        const ingredient = ingredientResult[0];

        if (quantityUsed > ingredient.quantity) {
            req.flash('error', 'Quantity used exceeds available stock.');
            return res.redirect('/ingredient-usage');
        }

        const usageSQL = `
            INSERT INTO ingredient_usage
            (ingredientId, staffId, quantityUsed, remarks)
            VALUES (?, ?, ?, ?)
        `;

        req.db.query(
            usageSQL,
            [ingredientId, staffId, quantityUsed, remarks],
            (err) => {

                if (err) {
                    console.error(err);
                    req.flash('error', 'Unable to record ingredient usage.');
                    return res.redirect('/ingredient-usage');
                }

                const newQuantity = ingredient.quantity - quantityUsed;

                const updateSQL = `
                    UPDATE ingredients
                    SET quantity = ?
                    WHERE ingredientId = ?
                `;

                req.db.query(
                    updateSQL,
                    [newQuantity, ingredientId],
                    (err) => {

                        if (err) {
                            console.error(err);
                            req.flash('error', 'Unable to update ingredient stock.');
                            return res.redirect('/ingredient-usage');
                        }

                        if (newQuantity <= ingredient.minimumStock) {

                            const checkSQL = `
                                SELECT *
                                FROM restock_requests
                                WHERE ingredientId = ?
                                AND status = 'Pending'
                            `;

                            req.db.query(
                                checkSQL,
                                [ingredientId],
                                (err, pendingResult) => {

                                    if (err) {
                                        console.error(err);
                                        req.flash('error', 'Unable to check restock requests.');
                                        return res.redirect('/ingredient-usage');
                                    }

                                    if (pendingResult.length === 0) {

                                        const requestQty = ingredient.minimumStock * 2;

                                        const requestSQL = `
                                            INSERT INTO restock_requests
                                            (
                                                ingredientId,
                                                requestedBy,
                                                requestedQuantity,
                                                status
                                            )
                                            VALUES (?, ?, ?, 'Pending')
                                        `;

                                        req.db.query(
                                            requestSQL,
                                            [ingredientId, staffId, requestQty],
                                            (err) => {

                                                if (err) {
                                                    console.error(err);
                                                    req.flash('error', 'Usage recorded but restock request could not be created.');
                                                    return res.redirect('/ingredient-usage');
                                                }

                                                req.flash(
                                                    'success',
                                                    'Ingredient usage recorded. Restocking request created automatically.'
                                                );

                                                return res.redirect('/ingredient-usage');
                                            }
                                        );

                                    } else {

                                        req.flash(
                                            'success',
                                            'Ingredient usage recorded successfully.'
                                        );

                                        return res.redirect('/ingredient-usage');
                                    }

                                }
                            );

                        } else {

                            req.flash(
                                'success',
                                'Ingredient usage recorded successfully.'
                            );

                            return res.redirect('/ingredient-usage');
                        }

                    }
                );

            }
        );

    });

});

// Starting the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
