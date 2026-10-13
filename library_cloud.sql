-- Library Management System (MySQL 8+): practice project
 
CREATE TABLE members (
  member_id  INT AUTO_INCREMENT PRIMARY KEY,
  full_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) NOT NULL UNIQUE,
  member_type ENUM('student','staff') NOT NULL DEFAULT 'student',
  joined_on  DATE NOT NULL
);

CREATE TABLE categories (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE authors (
  author_id   INT AUTO_INCREMENT PRIMARY KEY,
  author_name VARCHAR(100) NOT NULL
);

CREATE TABLE books (
  book_id      INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(150) NOT NULL,
  category_id  INT NOT NULL,
  published_year YEAR,
  copies_total TINYINT NOT NULL DEFAULT 1,
  copies_available TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

-- Many-to-many: a book can have many authors, an author many books
CREATE TABLE book_authors (
  book_id   INT NOT NULL,
  author_id INT NOT NULL,
  PRIMARY KEY (book_id, author_id),
  FOREIGN KEY (book_id)   REFERENCES books(book_id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(author_id) ON DELETE CASCADE
);

CREATE TABLE borrowings (
  borrow_id     INT AUTO_INCREMENT PRIMARY KEY,
  member_id     INT NOT NULL,
  book_id       INT NOT NULL,
  borrowed_on   DATE NOT NULL,
  due_date      DATE NOT NULL,
  returned_on   DATE,                    -- NULL means not returned yet
  FOREIGN KEY (member_id) REFERENCES members(member_id),
  FOREIGN KEY (book_id)   REFERENCES books(book_id)
);

CREATE TABLE reservations (
  reservation_id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  book_id   INT NOT NULL,
  reserved_on DATE NOT NULL,
  status ENUM('waiting','fulfilled','cancelled') NOT NULL DEFAULT 'waiting',
  FOREIGN KEY (member_id) REFERENCES members(member_id),
  FOREIGN KEY (book_id)   REFERENCES books(book_id)
);

CREATE TABLE fines (
  fine_id   INT AUTO_INCREMENT PRIMARY KEY,
  borrow_id INT NOT NULL UNIQUE,
  amount    DECIMAL(6,2) NOT NULL,
  paid      BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (borrow_id) REFERENCES borrowings(borrow_id)
);

-- ---------- Sample data ----------
INSERT INTO members (full_name,email,member_type,joined_on) VALUES
('Asha Rao','asha@mail.com','student','2025-06-10'),
('Karthik M','karthik@mail.com','student','2025-07-02'),
('Divya S','divya@mail.com','student','2026-01-15'),
('Mr. Ravi','ravi@mail.com','staff','2024-03-20'),
('Nisha P','nisha@mail.com','student','2026-02-01'),
('Sam J','sam@mail.com','student','2026-08-12');

INSERT INTO categories (category_name) VALUES ('Programming'),('Databases'),('Fiction'),('Science');

INSERT INTO authors (author_name) VALUES
('Robert Martin'),('Abraham Silberschatz'),('Henry Korth'),('Isaac Asimov'),('Carl Sagan');

INSERT INTO books (title,category_id,published_year,copies_total,copies_available) VALUES
('Clean Code',1,2008,3,2),
('Database System Concepts',2,2019,2,1),
('Foundation',3,1951,2,2),
('Cosmos',4,1980,1,0),
('The Pragmatic Programmer',1,2019,2,2),
('I, Robot',3,1950,1,1),
('SQL Basics',2,2021,3,3),
('Contact',3,1985,1,1);

INSERT INTO book_authors VALUES (1,1),(2,2),(2,3),(3,4),(4,5),(6,4),(8,5);

INSERT INTO borrowings (member_id,book_id,borrowed_on,due_date,returned_on) VALUES
(1,1,'2026-09-01','2026-09-15','2026-09-14'),
(1,2,'2026-09-20','2026-10-04',NULL),
(2,1,'2026-09-05','2026-09-19','2026-09-25'),
(2,4,'2026-09-28','2026-10-12',NULL),
(3,3,'2026-09-10','2026-09-24','2026-09-22'),
(3,2,'2026-10-01','2026-10-15',NULL),
(4,1,'2026-08-20','2026-09-03','2026-09-01'),
(4,5,'2026-09-12','2026-09-26','2026-09-26'),
(5,6,'2026-09-15','2026-09-29','2026-10-05'),
(1,3,'2026-10-02','2026-10-16',NULL);

INSERT INTO reservations (member_id,book_id,reserved_on,status) VALUES
(5,4,'2026-10-03','waiting'),
(6,2,'2026-10-05','waiting'),
(3,1,'2026-09-02','fulfilled');

INSERT INTO fines (borrow_id,amount,paid) VALUES (3,30.00,TRUE),(9,12.00,FALSE);
