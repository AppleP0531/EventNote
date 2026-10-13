-- EventNote 用データベース
-- ※ バックエンド起動時にも自動で作成されます（手動で流す場合はこのファイルを使用）

CREATE DATABASE IF NOT EXISTS db_eventnote
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE db_eventnote;

-- カテゴリ（色分け用）
CREATE TABLE IF NOT EXISTS categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(20) NOT NULL,                      -- 色の名前（red, blue など）
  sort_order INT NOT NULL DEFAULT 0
);

-- スケジュール
--   interval_value / interval_unit が NULL なら単発の予定
--   値があれば start_date から「interval_value ごとの interval_unit」で繰り返す
--   例: 3か月ごと → interval_value = 3, interval_unit = 'month'
--   曜日指定: 毎週火・金 → interval_unit = 'week', interval_value = 1, weekdays = '2,5'
--             第2・第4水曜 → interval_unit = 'month', month_mode = 'nth_weekday', week_numbers = '2,4', weekdays = '3'
--             毎月末 → interval_unit = 'month', month_mode = 'last_day'
CREATE TABLE IF NOT EXISTS schedules (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(100) NOT NULL,                 -- スケジュール名
  start_date     DATE NOT NULL,                         -- 初回日程
  start_time     TIME NULL,                             -- 時刻（任意。NULLなら終日。通知は設定の基準時刻で計算）
  interval_value INT NULL,                              -- 周期の数値（1以上）
  interval_unit  ENUM('day','week','month','year') NULL, -- 周期の単位
  weekdays       VARCHAR(20) NULL,                      -- 曜日（0=日〜6=土、カンマ区切り）週・第○曜日で使用
  month_mode     ENUM('date','nth_weekday','last_day') NULL, -- 月の繰り返し方（同じ日 / 第○曜日 / 月末）
  week_numbers   VARCHAR(20) NULL,                      -- 第何週か（1〜5、-1=最終、カンマ区切り）
  end_date       DATE NULL,                             -- 繰り返しの終了日（この日まで。NULLなら無期限）
  max_count      INT NULL,                              -- 繰り返しの回数（全N回。NULLなら無制限）
  memo           TEXT NULL,                             -- メモ（持ち物・手続きなど）
  category_id    INT NULL,                              -- カテゴリ
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 通知設定（1つのスケジュールに複数設定可）
--   例: 3日前 → amount = 3, unit = 'day' / 2時間前 → amount = 2, unit = 'hour'
CREATE TABLE IF NOT EXISTS schedule_reminders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  amount      INT NOT NULL,
  unit        ENUM('day','hour') NOT NULL,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  UNIQUE (schedule_id, amount, unit)
);

-- 回ごとの個別設定（繰り返しのうち1回だけ変更・休み・完了）
--   original_date は本来の予定日。moved_date / moved_time があればその回だけ日時を変更
CREATE TABLE IF NOT EXISTS occurrence_overrides (
  schedule_id   INT NOT NULL,
  original_date DATE NOT NULL,
  moved_date    DATE NULL,                              -- この回だけ別の日へ
  moved_time    TIME NULL,                              -- この回だけ別の時刻へ
  skipped       TINYINT(1) NOT NULL DEFAULT 0,          -- この回は休み
  done          TINYINT(1) NOT NULL DEFAULT 0,          -- 完了
  done_at       DATETIME NULL,
  PRIMARY KEY (schedule_id, original_date),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- ブラウザ通知（Web Push）の購読情報
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  endpoint   VARCHAR(500) NOT NULL UNIQUE,
  p256dh     VARCHAR(255) NOT NULL,
  auth       VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 送信済みの通知（同じ通知を2回送らないため）
CREATE TABLE IF NOT EXISTS sent_reminders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id     INT NOT NULL,
  occurrence_date DATE NOT NULL,                       -- 本来の予定日（original_date）
  amount          INT NOT NULL,
  unit            ENUM('day','hour') NOT NULL,
  sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  UNIQUE (schedule_id, occurrence_date, amount, unit)
);

-- アプリ設定（終日予定の通知基準時刻 allday_time、Web Push 用の VAPID 鍵など）
CREATE TABLE IF NOT EXISTS app_settings (
  name  VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL
);
