CREATE database student_csd;
create table student_details ( 
      id int primary KEY auto_increment,
      name varchar(100) not null,
      email varchar(100) unique,
      password_hash varchar(225),
      department varchar(50)
);   
describe student_csd;
   
