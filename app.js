const express = require('express');
const mysql = require('mysql2');

const session = require('express-session');

const flash = require('connect-flash');

const app = express();

// Database connection
const db = mysql.createConnection({
    host: '//Insert',
    user: '//Insert',
    password: '//Insert',
    database: '//Insert',
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
    
    cookie: {maxAge: //Insert }
}));

app.use(flash());

// Setting up EJS
app.set('view engine', 'ejs');


// Starting the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
