const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

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
res.redirect('/dashboard');
}
};

// Check if user is superadmin only - gates the register-admin page (Jun Yuan)
// staff.role in the DB is ENUM('Chef','Manager','SuperAdmin').
const checkSuperAdmin = (req, res, next) => {
if (req.session.user && req.session.user.role === 'SuperAdmin') {
return next();
} else {
req.flash('error', 'Access denied');
res.redirect('/dashboard');
}
};

// Check if user is a chef - gates the chef dashboard away from managers/superadmin (Jun Yuan)
const checkChef = (req, res, next) => {
if (req.session.user && req.session.user.role === 'Chef') {
return next();
} else {
req.flash('error', 'The dashboard is for chef accounts. Use the admin board instead.');
res.redirect('/admin');
}
};

// Alias so the existing /dashboard route (which references requireLogin) doesn't crash (Jun Yuan)
const requireLogin = checkAuthenticated;

// Routes for login (Jun Yuan)
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user, messages: req.flash('success')});
});

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
// Role is never read from the form - public registration always creates a 'Chef' account.
// NOTE: the DB table is `staff` (not `users`), and its name column is `fullName`.
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

// Register-manager routes: only a logged-in superadmin can reach these (Jun Yuan)
// View file is still named registerAdmin.ejs, only the route/role/wording changed to manager.
app.get('/register-manager', checkAuthenticated, checkSuperAdmin, (req, res) => {
    res.render('registerAdmin', { user: req.session.user, messages: req.flash('error'), formData: req.flash('formData')[0] });
});

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
errors: req.flash('error')
});
});

// User login route (Jun Yuan)
// NOTE: the DB table is `staff` (not `users`).
app.post('/login', (req, res) => {
const { email, password } = req.body;
// Validate email and password
if (!email || !password) {
req.flash('error', 'All fields are required.');
return res.redirect('/login');
}
const sql = 'SELECT * FROM staff WHERE email = ? AND password = SHA1(?)';
db.query(sql, [email, password], (err, results) => {
if (err) {
console.error('Login error:', err);
req.flash('error', 'Something went wrong while logging in. Please try again.');
return res.redirect('/login');
}
if (results.length > 0) {
// Successful login
const staffMember = results[0];
req.session.user = staffMember; // store user in session
req.flash('success', 'Login successful!');
// Route to the page that matches the account's role
if (staffMember.role === 'SuperAdmin') {
res.redirect('/');
} else if (staffMember.role === 'Manager') {
res.redirect('/admin');
} else {
res.redirect('/dashboard');
}
} else {
// Invalid credentials
req.flash('error', 'Invalid email or password.');
res.redirect('/login');
}
});
});

// Admin route (Jun Yuan)
// Manager and SuperAdmin both land on the same admin homepage.
app.get('/admin', checkAuthenticated, checkManager, (req, res) => {
res.render('admin', { user: req.session.user });
});

// Manage Inventory: search/filter + stats, backed by the `ingredients` table - Manager/SuperAdmin only(Tassie))
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
            SELECT DISTINCT category
            FROM ingredients
            WHERE category IS NOT NULL AND category <> ''
            ORDER BY category
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
            categories: categoryRows.map(r => r.category),
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
            return isExpired ? sum : sum + item.quantity;
        }, 0);

        // Below: counted by number of ingredients (unique ingredientId rows),
        // NOT by summing quantity — each ingredient counts as 1, regardless of how much stock it has.
        const expiredCount = results.filter((item) => {
            const expiry = new Date(item.expiryDate);
            expiry.setHours(0, 0, 0, 0);
            return expiry < today;
        }).length;

        const lowStockCount = results.filter((item) => item.quantity <= item.minimumStock).length;

        // Expired ingredients = food waste. Grab their quantity/unit for the waste bar chart. (rizq)
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

        // Most / least used ingredients, based on all recorded ingredient usage.
        req.db.query(`
            SELECT i.ingredientName, COALESCE(SUM(u.quantityUsed), 0) AS totalUsed
            FROM ingredients i
            LEFT JOIN ingredient_usage u ON u.ingredientId = i.ingredientId
            GROUP BY i.ingredientId, i.ingredientName
            ORDER BY totalUsed DESC
        `, (usageErr, usageRows) => {
            if (usageErr) {
                console.error('Board usage error:', usageErr);
                req.flash('error', 'Could not load ingredient usage stats. Please try again.');
                return res.redirect('/dashboard');
            }
            //rizq
            const usedRows = usageRows.filter((row) => row.totalUsed > 0);

            const mostUsedIngredients = usedRows.slice(0, 5);
            const leastUsedIngredients = [...usedRows].reverse().slice(0, 5);

            res.render('board', {
                user: req.session.user,
                totalAvailable,
                expiredCount,
                lowStockCount,
                foodWasteItems,
                mostUsedIngredients,
                leastUsedIngredients
            });
        });
    });
});

// Logout route (Jun Yuan)
app.get('/logout', (req, res) => {
req.session.destroy();
res.redirect('/');
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
// KITCHEN DASHBOARD AND EXPIRY MONITORING
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


// Chef homepage - lands here after login, mirrors the admin.ejs welcome page (Jun Yuan)
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


// Search & Filter routes (Tara)
app.get('/search', requireLogin, async (req, res) => {
    try {
        const search = req.query.search || '';
        const category = req.query.category || '';
        const storage = req.query.storage || '';
        const expiry = req.query.expiry || '';
        const sort = req.query.sort || '';

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
        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }
        if (storage) {
            sql += ` AND storageLocation = ?`;
            params.push(storage);
        }
        if (expiry === 'expired') {
            sql += ` AND expiryDate < CURDATE()`;
        } else if (expiry === '3days') {
            sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)`;
        } else if (expiry === '7days') {
            sql += ` AND expiryDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
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

        const [items] = await db.promise().query(sql, params);
        const [categoryRows] = await db.promise().query(
            `SELECT DISTINCT category FROM ingredients WHERE category IS NOT NULL ORDER BY category`
        );
        const [storageRows] = await db.promise().query(
            `SELECT DISTINCT storageLocation FROM ingredients WHERE storageLocation IS NOT NULL ORDER BY storageLocation`
        );

        res.render('search', {
            user: req.session.user,
            items,
            categories: categoryRows.map(r => r.category),
            storageOptions: storageRows.map(r => r.storageLocation),
            search,
            selectedCategory: category,
            selectedStorage: storage,
            selectedExpiry: expiry,
            selectedSort: sort
        });
    } catch (error) {
        console.error('Search error:', error);
        req.flash('error', 'Something went wrong while searching. Please try again.');
        res.redirect('/dashboard');
    }
});

app.get('/expiring', requireLogin, async (req, res) => {
    try {
        const sql = `
            SELECT *, DATEDIFF(expiryDate, CURDATE()) AS daysUntilExpiry
            FROM ingredients
            WHERE expiryDate <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)
            ORDER BY expiryDate ASC
        `;
        const [items] = await db.promise().query(sql);
        res.render('expiring', { user: req.session.user, items });
    } catch (error) {
        console.error('Expiring error:', error);
        req.flash('error', 'Something went wrong loading expiring items. Please try again.');
        res.redirect('/dashboard');
    }
});

// [GET] Display Ingredient Usage Form (Sean)
app.get('/ingredient-usage', checkAuthenticated, (req, res) => {

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

        res.render('ingredientUsage', {
            user: req.session.user,
            ingredients,
            messages: req.flash('success'),
            errors: req.flash('error')
        });

    });

});


// [POST] Record Ingredient Usage, Update Inventory & Create Restocking Request (Sean)
app.post('/ingredient-usage', checkAuthenticated, (req, res) => {

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