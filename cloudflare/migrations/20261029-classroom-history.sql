CREATE TABLE IF NOT EXISTS student_classrooms (
 student_id TEXT NOT NULL,
 academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 2400 AND 2800),
 semester INTEGER NOT NULL CHECK (semester IN (1,2)),
 class_room TEXT NOT NULL,
 source TEXT NOT NULL,
 PRIMARY KEY (student_id,academic_year,semester)
);
INSERT OR IGNORE INTO student_classrooms(student_id,academic_year,semester,class_room,source)
SELECT p.student_id,
 CAST(json_extract(h.value,'$.academicYear') AS INTEGER),
 CAST(json_extract(h.value,'$.semester') AS INTEGER),
 json_extract(h.value,'$.classRoom'),
 'confirmed-program-history'
FROM student_programs p, json_each(CASE WHEN json_valid(p.class_history) THEN p.class_history ELSE '[]' END) h
WHERE json_extract(h.value,'$.academicYear') BETWEEN 2400 AND 2800
 AND json_extract(h.value,'$.semester') IN (1,2)
 AND json_extract(h.value,'$.classRoom') IS NOT NULL;
