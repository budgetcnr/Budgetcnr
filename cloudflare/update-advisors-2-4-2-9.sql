-- Requested advisor assignments. Preserve teacher accounts and all other rooms.
INSERT INTO teacher_advisory_rooms (id, teacher_id, class_room, source, import_version)
SELECT 'person-d34111c3f738edd7fb0c:ม.2/9', id, 'ม.2/9', 'ผู้ดูแลยืนยัน 26 ต.ค. 2569', 'advisor-update-20261026'
FROM teacher_roster
WHERE id='person-d34111c3f738edd7fb0c' AND full_name='นางสาวณัฏชนากานต์ อิทธิวิวัฒนกุล' AND login_enabled=1
ON CONFLICT(id) DO NOTHING;
DELETE FROM teacher_advisory_rooms
WHERE class_room='ม.2/9' AND teacher_id<>'person-d34111c3f738edd7fb0c'
AND EXISTS (SELECT 1 FROM teacher_advisory_rooms WHERE class_room='ม.2/9' AND teacher_id='person-d34111c3f738edd7fb0c');
DELETE FROM teacher_advisory_rooms
WHERE class_room='ม.2/4' AND teacher_id<>'person-042bba5db7087bddbd33'
AND EXISTS (SELECT 1 FROM teacher_advisory_rooms WHERE class_room='ม.2/4' AND teacher_id='person-042bba5db7087bddbd33')
AND EXISTS (SELECT 1 FROM teacher_advisory_rooms WHERE class_room='ม.2/9' AND teacher_id='person-d34111c3f738edd7fb0c');
