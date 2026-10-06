CREATE DATABASE eventnote;

-- 繰り返しルール（周期登録用）
CREATE TABLE IF NOT EXISTS recurrence_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  interval_unit ENUM('day','week','month','year') NOT NULL,
  interval_value INT NOT NULL,          -- 例: 3年ごと → year / 3
  start_date DATE NOT NULL,
  end_date DATE NULL,                   -- NULLなら無期限
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 予定（1件ずつ登録も、周期から生成されたものもここに入る）
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(100) NOT NULL,          -- 「免許更新日」など
  due_date DATE NOT NULL,
  memo TEXT NULL,
  rule_id INT NULL,                     -- 周期登録なら紐づく
  is_done TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rule_id) REFERENCES recurrence_rules(id) ON DELETE SET NULL
);

-- 通知設定（何日前に通知するか）
CREATE TABLE IF NOT EXISTS reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  days_before INT NOT NULL,             -- 例: 90, 30, 7, 1
  notified_at DATETIME NULL,            -- 送信済みなら日時
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE (event_id, days_before)
);

-- ブラウザ通知（Web Push）の購読情報
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(500) NOT NULL UNIQUE,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);