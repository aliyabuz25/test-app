# BibleDashboard - Admin Panel & API Specification Documentation

This repository houses a secure, production-grade Node.js / Express.js Backend API and a dynamic, client-side dynamic CMS Management Dashboard styled with native **AdminLTE 3**. It features automated **DataTables** listing, multi-language localization (EN, TR, DE, ES, FR, IT), dual-thumbnail image uploads via **Multer**, cross-origin resource sharing (**CORS**), security shields (**Helmet**), input **HTML/XSS Sanitization**, and authentication bruteforce protection (**Rate Limiting**).

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v12.x or above)
- **npm** or **yarn**

### Installation
1. Clone or download the repository into your workspace.
2. Install all dependencies:
   ```bash
   npm install
   ```

### Running the Server
Start the Express server on local port `3000`:
```bash
node index.js
```
The server will boot and seed the database with a default Admin user and sample visual catalog publications.
- **Admin Dashboard Console:** Access at [http://localhost:3000/](http://localhost:3000/) (requires login)
- **Login Screen:** Direct access at [http://localhost:3000/login](http://localhost:3000/login)
- **Register Screen:** Direct access at [http://localhost:3000/register](http://localhost:3000/register)

### Running Automated Integration Tests
Execute the integration testing suite checking API endpoints, XSS filtering, rate-limiting triggers, and multipart upload integrity:
```bash
node test.js
```

---

## 🔒 Security Specs & Guard Middlewares

1. **Helmet Security Headers:**
   Protects from clickjacking, MIME sniffing, and enforces modern secure HTTP header rules.
2. **User-Agent Shield:**
   All client-side API requests must include a specific header (dashboard requests are automatically set):
   * **Header Required:** `User-Agent: bible-appclient`
3. **HTML / XSS Input Sanitizer:**
   All parameters sent to backend endpoints (such as `firstName`, `lastName`, `email`, `description`, etc.) are HTML-escaped. Script tags or malicious payloads (e.g. `<script>`) are automatically sanitized to prevent Cross-Site Scripting (XSS).
4. **Bruteforce Rate Limiter:**
   Authentication endpoints (`/api/auth/register`, `/api/auth/login`) are protected with a rate limiter restricting a single IP address to:
   * **Limit:** Maximum of 5 requests per 15 minutes.
   * **Trigger Response:** `429 Too Many Requests` status code with an appropriate notification message.

---

## 🖥️ CMS Admin Panel Features & Usage Guide

1. **Clean Native AdminLTE 3 Layout:**
   Styled with standard, modern AdminLTE stylesheet guidelines. Removed custom CSS conflicts to ensure 100% responsive fluid grid scaling.
2. **Dynamic Dashboard Overview Cards:**
   Displays live catalog counts, API service indicators, active multipart config states, and security shield status.
3. **DataTables Catalog View:**
   * **Interactive Lists:** Upgraded with high-performance DataTables grid.
   * **Features:** Built-in instant text filtering/searching, column sorting, pagination controls (5, 10, 25, 50 rows per page), and entries info summary.
   * **Dynamic Reloading:** Safely destroys and re-initializes tables upon dynamic API fetches.
4. **Add Catalog Item Form:**
   * Contains input validation for publication name and summary description.
   * Drag-and-drop or select file inputs with active preview containers showing vertical aspect ratios (3:4) and horizontal aspect ratios (16:9).
5. **Image Lightbox Modal Preview:**
   Clicking vertical thumbnail covers or horizontal banners pops up an elegant overlay Lightbox Modal, allowing zoom previews of catalog uploads.
6. **Dynamic Language Switcher:**
   * Header dropdown menu supports English, Türkçe, Deutsch, Español, Français, and Italiano.
   * Selecting a language updates UI translations dynamically by requesting the dictionary endpoint.

---

## 📡 API Endpoint Reference

### 1. Authentication Endpoints

#### A. User Registration (`POST /api/auth/register`)
Register a new system user. Password credentials are automatically salted and hashed using `bcryptjs`.

* **Headers:**
  * `Content-Type: application/json`
  * `User-Agent: bible-appclient`
* **JSON Body:**
  ```json
  {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "5559876543",
    "password": "SecurePassword123"
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "message": "Kayıt başarıyla tamamlandı.",
    "user": {
      "id": 2,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "5559876543"
    }
  }
  ```

#### B. User Login (`POST /api/auth/login`)
Authenticate user credentials and receive a JWT token.

* **Headers:**
  * `Content-Type: application/json`
  * `User-Agent: bible-appclient`
* **JSON Body:**
  ```json
  {
    "email": "john.doe@example.com",
    "password": "SecurePassword123"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "message": "Giriş başarılı.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6...",
    "user": {
      "id": 2,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "phoneNumber": "5559876543"
    }
  }
  ```

---

### 2. Catalog Management Endpoints

#### A. Get Catalogs List (`GET /api/catalogs`)
Retrieve all visual catalog publications present in the database.

* **Headers:**
  * `User-Agent: bible-appclient`
* **Success Response (200 OK):**
  ```json
  [
    {
      "id": 1,
      "name": "Visual Bible Catalog v1",
      "description": "Holy Bible visual catalog containing illustrations and text guides.",
      "thumbnailVertical": "https://cdn.biblecms.com/images/bible_vertical.jpg",
      "thumbnailHorizontal": "https://cdn.biblecms.com/images/bible_horizontal.jpg",
      "createdAt": "2026-06-15T10:00:00.000Z"
    }
  ]
  ```

#### B. Add Catalog Publication (`POST /api/catalogs`)
Creates a new publication with dual multipart image upload files (vertical thumbnail + horizontal banner).
* **Headers:**
  * `User-Agent: bible-appclient`
* **Multipart/Form-Data Fields:**
  * `name`: Name string (escaped against XSS).
  * `description`: Summary description (escaped against XSS).
  * `verticalImage`: File upload (Aspect ratio 3:4 portrait cover).
  * `horizontalImage`: File upload (Aspect ratio 16:9 landscape banner).
* **Success Response (201 Created):**
  ```json
  {
    "message": "Katalog öğesi başarıyla eklendi.",
    "catalog": {
      "id": 3,
      "name": "New Visual Guide",
      "description": "Short explanation text...",
      "thumbnailVertical": "https://cdn.biblecms.com/images/1781519384444-612725527.png",
      "thumbnailHorizontal": "https://cdn.biblecms.com/images/1781519384445-329070018.jpg",
      "createdAt": "2026-06-15T10:29:44.446Z"
    }
  }
  ```

---

### 3. Dynamic Locales Endpoint

#### A. Get Dynamic Translations (`GET /api/locales`)
Dynamic localization dictionary provider for client UI components. Supports English, Türkçe, Deutsch, Español, Français, and Italiano.

* **Headers:**
  * `User-Agent: bible-appclient`
* **Success Response (200 OK):**
  ```json
  {
    "en": {
      "home": "Home",
      "catalog": "Catalog"
    },
    "tr": {
      "home": "Anasayfa",
      "catalog": "Katalog"
    }
  }
  ```

---

### 4. Users CRUD Endpoints

#### A. List Users (`GET /api/users`)
Retrieve all registered users (passwords are omitted from the output).
* **Headers:**
  * `User-Agent: bible-appclient`
* **Success Response (200 OK):**
  ```json
  [
    {
      "id": 1,
      "firstName": "Mehmet",
      "lastName": "Demir",
      "email": "mehmet@example.com",
      "phoneNumber": "5559876543",
      "createdAt": "2026-06-15T10:00:00.000Z"
    }
  ]
  ```

#### B. Update User (`PUT /api/users/:id`)
Update user details like name, email, phone number, and optionally change the password.
* **Headers:**
  * `Content-Type: application/json`
  * `User-Agent: bible-appclient`
* **JSON Body:**
  ```json
  {
    "firstName": "Ali",
    "lastName": "Yazıcı",
    "email": "ali@example.com",
    "phoneNumber": "5551112233",
    "password": "newpassword123"
  }
  ```

#### C. Delete User (`DELETE /api/users/:id`)
Remove a user from the system.

---

### 5. In-App Purchase Payments Endpoints

#### A. List Payments (`GET /api/payments`)
Retrieve in-app purchase logs.
* **Headers:**
  * `User-Agent: bible-appclient`
* **Success Response (200 OK):**
  ```json
  [
    {
      "id": 1,
      "userId": 1,
      "userEmail": "admin@biblecms.com",
      "productId": "premium_yearly_pass",
      "amount": 49.99,
      "currency": "USD",
      "status": "completed",
      "transactionId": "ch_3M4oK6LvkILeX1a20aBcDeFg",
      "createdAt": "2026-06-15T10:00:00.000Z"
    }
  ]
  ```

---

### 6. Notifications Endpoints

#### A. Send Notification (`POST /api/notifications`)
Broadcast or target notifications.
* **Headers:**
  * `Content-Type: application/json`
  * `User-Agent: bible-appclient`
* **JSON Body:**
  ```json
  {
    "title": "Update Available",
    "message": "We have loaded new vertical guide maps.",
    "type": "info",
    "sentTo": "all"
  }
  ```

#### B. List Notifications (`GET /api/notifications`)
Retrieve sent notifications.

#### C. Delete Notification (`DELETE /api/notifications/:id`)
Remove a notification from history.

---

## 📂 Project Architecture

```
├── README.md               # Master CMS and API documentation
├── FETCH_DOCS.md           # Client side javascript code examples for uploads
├── openapi.json            # OpenAPI 3.0 specs sheet
├── index.js                # Core Express application and routers
├── test.js                 # Integration testing suite
├── controllers/
│   └── CatalogController.js# Handles list and file-uploads with CDN mapping
├── models/
│   ├── Catalog.js          # In-memory storage helper for catalog items
│   ├── User.js             # User database layer and CRUD methods
│   ├── Payment.js          # Payment database layer and in-app purchase tracking
│   └── Notification.js     # Notification database layer and push logging
├── middlewares/
│   ├── authMiddleware.js   # JWT validation rules
│   └── xssSanitizer.js     # Character-escape sanitization logic
├── data/
│   └── locales.json        # Dynamic translation dictionaries
├── uploads/                # Local file storage for multipart images
└── views/
    ├── login.ejs           # Admin login interface
    ├── register.ejs        # Admin register interface
    └── dashboard.ejs       # AdminLTE 3 console board with DataTables
```
