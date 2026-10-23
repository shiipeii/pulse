-- ─────────────────────────────────────────────────────────────────────────────
-- SAMPLE DATA — paste into the Supabase SQL Editor and click Run.
--
-- Fills every screen with realistic, already-classified feedback so you can see
-- how Pulse looks without the AI keys: ~170 reports in 18 themes over 6 months,
-- a review queue, tickets, reports, suggested actions, sources, activity, staff
-- and a few items under YOUR email so "Your feedback" (/me) shows something.
--
-- Everything is fictional. Safe to run again: it replaces the previous sample.
-- To remove it, run supabase/REMOVE_SAMPLE_DATA.sql.
-- Run supabase/UPGRADE_TO_V0.4.sql first to get effort sizes and decisions too.
--
-- ▶ Change this line to your own MOE email (the one you sign in with on /me):
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.sample_me() returns text language sql as $$ select 'lim_shi_pei@moe.gov.sg' $$;

do $$
declare
  me        text := pg_temp.sample_me();
  p         uuid;
  ch_form   uuid; ch_survey uuid; ch_email uuid; ch_mailbox uuid; ch_import uuid; ch_helpdesk uuid;
  th        record;
  tid       uuid;
  i         int;
  n_items   int;
  age       numeric;
  ch        uuid;
  r         double precision;
  sev       text;
  ftype     text;
  ucat      text;
  txt       text;
  summ      text;
  revs      text;
  schools   text[] := array['Northvale Primary','Eastbrook Secondary','Riverside Primary','Hillcrest Secondary','Bayview JC','Parkside Primary','Lakeside Secondary','Greenfield Primary'];
  names     text[] := array['Mrs Tan','Mr Lim','Ms Nur','Mr Raj','Mdm Wong','Ms Chloe','Mr Hafiz','Ms Priya','Mr Daniel','Mdm Siti'];
  segs      text[] := array['Primary school','Secondary school','Junior college'];
  theme_ids jsonb := '{}'::jsonb;
begin
  perform setseed(0.42);

  -- ── tenant zero ────────────────────────────────────────────────────────────
  insert into products (name, slug) values ('Teacher''s Workspace', 'tw') on conflict (slug) do nothing;
  select id into p from products where slug = 'tw';

  -- ── clear the previous sample ──────────────────────────────────────────────
  delete from themes where product_id = p and id in (
    select f.theme_id from feedback f join channels c on c.id = f.channel_id
    where c.product_id = p and c.name like '% (sample)' and f.theme_id is not null);
  delete from channels  where product_id = p and name like '% (sample)';
  delete from sources   where product_id = p and notes like 'Sample data%';
  delete from reports   where product_id = p and recipients like '%.sample@%';
  delete from insights  where product_id = p and kind = 'weekly_actions';
  delete from audit_log where product_id = p and after ->> 'sample' = 'true';
  delete from staff     where email like '%.sample@moe.gov.sg';

  -- ── channels ───────────────────────────────────────────────────────────────
  insert into channels (product_id, name, type, decoder, ingest_token)
    values (p, 'Pulse feedback form (sample)', 'form', 'passthrough', 'sample-form') returning id into ch_form;
  insert into channels (product_id, name, type, decoder, ingest_token)
    values (p, 'FormSG termly survey (sample)', 'webhook', 'passthrough', 'sample-survey') returning id into ch_survey;
  insert into channels (product_id, name, type, decoder, ingest_token, inbound_address)
    values (p, 'Email forward (sample)', 'email', 'email', 'sample-email', 'tw-feedback.sample@feedback.example') returning id into ch_email;
  insert into channels (product_id, name, type, decoder, ingest_token, inbound_address)
    values (p, 'Shared mailbox (sample)', 'mailbox', 'mailbox', 'sample-mailbox', 'tw-feedback.sample@moe.gov.sg') returning id into ch_mailbox;
  insert into channels (product_id, name, type, decoder, ingest_token)
    values (p, 'Term 2 teacher survey (sample)', 'import', 'import', 'sample-import') returning id into ch_import;
  insert into channels (product_id, name, type, decoder, ingest_token)
    values (p, 'School IT help desk (sample)', 'import', 'import', 'sample-helpdesk') returning id into ch_helpdesk;

  -- ── themes and their reports ───────────────────────────────────────────────
  -- n = reports, win = spread in days, bias < 1 = mostly recent (growing), > 1 = mostly older
  for th in
    select * from (values
      -- key, category, status, label, summary, area, n, win, bias, sevs, sentiment, owner, fixed_ago, released_ago, regressed, suggestion, texts
      ('att', 'bug', 'being_fixed', 'Attendance doesn''t save on iPad Safari',
       'Teachers on iPads lose attendance they just marked; the page reloads and the ticks are gone.',
       'Attendance', 20, 30, 0.45, array['high','critical','high','high','medium'], 'negative', 'Wei Jie (Eng)', null::int, null::int, false,
       'Reports cluster on iPad Safari after the last release, so this looks like the save request failing when Safari suspends the tab. Adding an autosave with a visible "Saved" state and retrying failed saves would stop the data loss while the root cause is fixed.',
       array['I marked attendance for 3E2 on my iPad and when I pressed Save the page refreshed and everything was unticked. Had to do it again on my laptop.',
             'Attendance ticks disappear after saving on iPad. Happened twice this week during morning assembly.',
             'On Safari the attendance page says saved but when I go back it is empty. Very frustrating when I have 40 students.',
             'Morning attendance not saving on iPad. The spinner goes on forever then the page reloads.',
             'Please fix attendance on iPad, I had to redo my form class attendance three times today.']),
      ('marks', 'bug', 'open', 'Marks entry times out for large classes',
       'Saving marks for classes of 35+ students often fails with a timeout, losing unsaved marks.',
       'Marks entry', 13, 40, 0.8, array['high','high','medium','critical'], 'negative', 'Aisha (PM)', null, null, false,
       'Timeouts only happen above about 35 students, which suggests the whole class is saved in one request. Saving each row as it is entered, or in smaller batches, would avoid the timeout and the lost work.',
       array['Keyed in WA2 marks for 38 students and got "request timed out". All marks lost.',
             'Marks entry keeps timing out for my biggest class. Smaller classes are fine.',
             'Timeout error when saving marks. I now save every 10 students to be safe.',
             'The marks page freezes and times out when saving a full class list.']),
      ('login', 'bug', 'fixed', 'Login loop after the session times out',
       'After a period of inactivity, signing in again sent teachers back to the login page in a loop.',
       'Sign-in', 9, 70, 1.6, array['high','medium','high'], 'negative', 'Wei Jie (Eng)', 12, null, false, null,
       array['After lunch I tried to log in again and it kept bringing me back to the login page.',
             'Stuck in a login loop, had to clear my browser cookies to get in.',
             'Every time the session expires I cannot log back in without restarting the browser.']),
      ('report', 'bug', 'open', 'Report book PDF shows the wrong term',
       'Downloaded report book PDFs label Term 3 results as Term 2. Fixed once, then reported again.',
       'Report books', 6, 50, 1.0, array['medium','high','medium'], 'negative', 'Wei Jie (Eng)', 20, null, true, null,
       array['The report book PDF says Term 2 but the results are Term 3.',
             'Parents asked why the report book shows the wrong term. It says Term 2 on the header.',
             'Wrong term printed on the report book again after it was fixed last month.']),
      ('timetable', 'bug', 'open', 'Timetable shows duplicate periods after a swap',
       'Swapping two periods leaves both the old and new lessons on the timetable.',
       'Timetable', 7, 45, 0.9, array['medium','medium','low'], 'negative', null, null, null, false, null,
       array['After swapping periods with a colleague, my timetable shows both lessons in the same slot.',
             'Duplicate periods on Thursday after the relief swap. Which one is correct?',
             'Timetable has two lessons at 10am since I swapped with Mr Lim.']),
      ('attach', 'bug', 'open', 'Parent message attachments over 5 MB fail',
       'Attaching larger files to parent messages fails without a clear error.',
       'Parent messages', 4, 60, 1.0, array['medium','low'], 'negative', null, null, null, false, null,
       array['Tried to attach the camp consent form (6 MB) to a parent message and it just failed silently.',
             'Attachments over a certain size do not upload to parent messages. No error shown.']),
      ('contrast', 'bug', 'not_now', 'Header text hard to read in high-contrast mode',
       'In high-contrast mode, the header text is dark on a dark background.',
       'Accessibility', 2, 90, 1.2, array['low'], 'neutral', null, null, null, false, null,
       array['With high contrast turned on, I cannot read the header menu.']),
      ('cca', 'bug', 'being_fixed', 'CCA attendance export misses some students',
       'Exporting CCA attendance leaves out students who joined mid-year.',
       'CCA', 6, 35, 0.7, array['high','medium','high'], 'negative', 'Ravi (Eng)', null, null, false, null,
       array['The CCA attendance export is missing the two students who joined in April.',
             'CCA export does not include new members. I have to add them by hand every week.',
             'Some students are missing from the exported CCA attendance list.']),
      ('bulk', 'feature', 'planned', 'Mark the whole class present in one tap',
       'Teachers want a "mark all present" button, then untick the few who are absent.',
       'Attendance', 24, 150, 0.9, array['low'], 'neutral', 'Aisha (PM)', null, null, false,
       'This is the most requested idea across every channel and school level. A "Mark all present" button with a quick undo would save a few minutes every morning for every form teacher.',
       array['Could we have a button to mark everyone present, then just untick the absentees? Most days only 1-2 are absent.',
             'Please add "mark all present". Ticking 40 boxes every morning takes time.',
             'Suggestion: one tap to mark the whole class present.',
             'Would love a select-all for attendance.']),
      ('copy', 'feature', 'open', 'Copy a lesson plan to another class',
       'Teachers teaching the same subject to several classes want to reuse a lesson plan.',
       'Lesson planning', 15, 120, 0.8, array['low'], 'neutral', null, null, null, false,
       'Teachers are recreating identical plans for parallel classes. A "Copy to class…" action that keeps resources and lets them adjust dates would remove most of this repeat work.',
       array['I teach 4 Sec 2 classes the same lesson. Please let me copy my lesson plan instead of typing it 4 times.',
             'Can we duplicate a lesson plan to another class?',
             'A copy function for lesson plans would save so much time.']),
      ('excel', 'feature', 'released', 'Export marks to Excel',
       'Teachers asked to download class marks as an Excel file for their own analysis.',
       'Marks entry', 11, 170, 1.4, array['low'], 'positive', 'Aisha (PM)', null, 6, false, null,
       array['Please allow exporting marks to Excel so I can do my own analysis.',
             'Can we download the marks as an Excel sheet?',
             'Export to Excel for marks please! HODs keep asking me for the data.']),
      ('offline', 'feature', 'not_now', 'Offline mode for the mobile app',
       'Teachers on field trips want to take attendance without internet.',
       'Mobile app', 9, 160, 1.3, array['low'], 'neutral', null, null, null, false, null,
       array['During learning journeys there is no signal. Could attendance work offline and sync later?',
             'Offline mode for the app would help on field trips.']),
      ('remind', 'feature', 'open', 'Reminders for marks not yet submitted',
       'Teachers want a reminder before the marks submission deadline.',
       'Marks entry', 8, 60, 0.7, array['low'], 'neutral', null, null, null, false, null,
       array['A reminder a few days before marks are due would be helpful.',
             'Could the system remind me which classes still have missing marks?',
             'Email reminder for unsubmitted marks please.']),
      ('dark', 'feature', 'open', 'Dark mode',
       'Teachers who work late asked for a dark theme.',
       'Look and feel', 6, 120, 1.0, array['low'], 'neutral', null, null, null, false, null,
       array['Dark mode please! I mark at night and the white screen is very bright.',
             'Any plans for a dark theme?']),
      ('share', 'feature', 'open', 'Share lesson resources across the department',
       'Departments want a shared space for worksheets and slides.',
       'Lesson planning', 5, 100, 1.0, array['low'], 'neutral', null, null, null, false, null,
       array['It would be good if the department could share worksheets in one place.',
             'Can I share my resources with other teachers in my department?']),
      ('weekly', 'feature', 'planned', 'Weekly summary email of my classes',
       'Form teachers want a weekly email summarising attendance and missing work.',
       'Notifications', 4, 90, 1.0, array['low'], 'neutral', 'Aisha (PM)', null, null, false, null,
       array['A weekly summary email for my form class (attendance, late submissions) would be great.',
             'Could I get a weekly digest of my classes?']),
      ('praise', 'other', 'open', 'The new dashboard is faster',
       'Positive comments about the faster, cleaner dashboard.',
       'Dashboard', 7, 40, 0.8, array['low'], 'positive', null, null, null, false, null,
       array['The new dashboard loads so much faster. Thank you!',
             'Love the cleaner home page, easier to find things.',
             'Great improvement on the dashboard, well done team.']),
      ('howto', 'other', 'open', 'How do I change my form class?',
       'Questions about updating form class assignments.',
       'Settings', 3, 80, 1.0, array['low'], 'neutral', null, null, null, false, null,
       array['How do I change my form class? I was reassigned this term.',
             'Where do I update which class I am the form teacher of?'])
    ) as v(key, category, status, label, summary, area, n, win, bias, sevs, sentiment, owner, fixed_ago, released_ago, regressed, suggestion, texts)
  loop
    insert into themes (product_id, label, summary, category, status, owner, regressed, suggestion, suggestion_at,
                        fixed_at, released_at, decided_at, created_at)
    values (p, th.label, th.summary, th.category, th.status, th.owner, th.regressed, th.suggestion,
            case when th.suggestion is not null then now() - interval '2 days' end,
            case when th.fixed_ago is not null then now() - (th.fixed_ago || ' days')::interval end,
            case when th.released_ago is not null then now() - (th.released_ago || ' days')::interval end,
            case when th.status <> 'open' or th.regressed then now() - interval '14 days' end,
            now() - (th.win || ' days')::interval)
    returning id into tid;
    theme_ids := theme_ids || jsonb_build_object(th.key, tid);

    n_items := th.n;
    for i in 1 .. n_items loop
      r   := random();
      age := greatest(0.1, power(random(), 1.0 / th.bias) * th.win);
      -- fixed themes: reports come before the fix; a regression brings 2 back after it
      if th.fixed_ago is not null then
        age := th.fixed_ago + 1 + random() * greatest(1, th.win - th.fixed_ago);
        if th.regressed and i <= 2 then age := random() * (th.fixed_ago - 1) + 0.5; end if;
      end if;
      -- older feedback came mostly from email and imports; recent mostly from the Pulse form
      if age > 90 then
        ch := (array[ch_email, ch_import, ch_helpdesk, ch_email])[1 + floor(random() * 4)::int];
      elsif age > 45 then
        ch := (array[ch_email, ch_survey, ch_mailbox, ch_form, ch_import])[1 + floor(random() * 5)::int];
      else
        ch := (array[ch_form, ch_form, ch_form, ch_survey, ch_mailbox, ch_email])[1 + floor(random() * 6)::int];
      end if;

      sev   := th.sevs[1 + ((i - 1) % array_length(th.sevs, 1))];
      txt   := th.texts[1 + ((i - 1) % array_length(th.texts, 1))];
      summ  := th.summary;
      ftype := case th.category when 'bug' then 'bug' when 'feature' then 'feature_request'
                 else case when th.key = 'praise' then 'praise' else 'question' end end;
      ucat  := case when th.category in ('bug', 'feature') then th.category else null end;
      if th.category = 'bug' and random() < 0.5 then
        txt := txt || E'\n\nUsing: ' || (array['Tablet, Safari','Computer, Chrome','Computer, Edge','Phone, Safari'])[1 + floor(random() * 4)::int];
      end if;
      -- recent items are still waiting for a PM; the rest were verified
      revs := case when age < 6 and random() < 0.6 then 'pending' else 'verified' end;

      insert into feedback (product_id, channel_id, source_msg_id, raw_text, raw_payload, author, received_at, status,
                            segment, feature_area, type, severity, sentiment, summary, theme_id,
                            category, user_category, ai_category, ai_corrected, review_status, verified_by, verified_at,
                            submitter_email, enriched_at)
      values (p, ch, 'sample-' || th.key || '-' || i, txt, '{"sample": true}'::jsonb,
              names[1 + floor(random() * array_length(names, 1))::int] || ', ' || schools[1 + floor(random() * array_length(schools, 1))::int],
              now() - (age || ' days')::interval, 'clustered',
              segs[1 + floor(random() * 3)::int], th.area, ftype,
              case when th.category = 'bug' then sev else 'low' end, th.sentiment, summ, tid,
              th.category, ucat, th.category, false, revs,
              case when revs = 'verified' then 'Aisha (PM)' end,
              case when revs = 'verified' then now() - ((age * 0.8) || ' days')::interval end,
              'teacher' || lpad((1 + floor(random() * 120))::int::text, 3, '0') || '.sample@moe.edu.sg',
              now() - (age || ' days')::interval);
    end loop;
  end loop;

  -- ── three items where the AI changed the teacher's pick (top of Review) ────
  insert into feedback (product_id, channel_id, source_msg_id, raw_text, raw_payload, author, received_at, status, segment,
                        feature_area, type, severity, sentiment, summary, theme_id, category, user_category, ai_category,
                        ai_reason, ai_corrected, review_status, submitter_email, enriched_at)
  values
    (p, ch_form, 'sample-corr-1', 'It would be nice if attendance had a button to mark everybody present.', '{"sample": true}', 'Ms Priya, Riverside Primary',
     now() - interval '1 day', 'clustered', 'Primary school', 'Attendance', 'feature_request', 'low', 'neutral',
     'Teacher asks for a mark-all-present button.', (theme_ids ->> 'bulk')::uuid, 'feature', 'bug', 'feature',
     'Nothing is broken; the teacher is asking for a new button, so this is a feature suggestion.', true, 'pending',
     'teacher201.sample@moe.edu.sg', now() - interval '1 day'),
    (p, ch_form, 'sample-corr-2', 'Dark mode please, my eyes hurt at night.', '{"sample": true}', 'Mr Hafiz, Lakeside Secondary',
     now() - interval '2 days', 'clustered', 'Secondary school', 'Look and feel', 'feature_request', 'low', 'neutral',
     'Teacher asks for a dark theme.', (theme_ids ->> 'dark')::uuid, 'feature', 'bug', 'feature',
     'Describes a preference for a new theme, not something that stopped working.', true, 'pending',
     'teacher202.sample@moe.edu.sg', now() - interval '2 days'),
    (p, ch_form, 'sample-corr-3', 'When I save marks for 3E1 it says request timed out and I lose everything.', '{"sample": true}', 'Mdm Wong, Eastbrook Secondary',
     now() - interval '3 days', 'clustered', 'Secondary school', 'Marks entry', 'bug', 'high', 'negative',
     'Saving marks times out and loses the teacher''s work.', (theme_ids ->> 'marks')::uuid, 'bug', 'feature', 'bug',
     'Something that should work (saving marks) fails with an error, so this is a bug.', true, 'pending',
     'teacher203.sample@moe.edu.sg', now() - interval '3 days');

  -- ── YOUR items, so /me shows every state ───────────────────────────────────
  insert into feedback (product_id, channel_id, source_msg_id, raw_text, raw_payload, author, received_at, status, segment,
                        feature_area, type, severity, sentiment, summary, theme_id, category, user_category, ai_category,
                        review_status, verified_by, verified_at, submitter_email, enriched_at)
  values
    (p, ch_form, 'sample-me-1', E'Attendance for my form class did not save on my iPad this morning. I had to redo it on the laptop.\n\nUsing: Tablet, Safari',
     '{"sample": true}', me, now() - interval '9 days', 'clustered', 'Secondary school', 'Attendance', 'bug', 'high', 'negative',
     'Attendance lost after saving on iPad.', (theme_ids ->> 'att')::uuid, 'bug', 'bug', 'bug', 'verified', 'Aisha (PM)', now() - interval '8 days', me, now() - interval '9 days'),
    (p, ch_form, 'sample-me-2', 'I keep getting sent back to the login page after my session expires.',
     '{"sample": true}', me, now() - interval '25 days', 'clustered', 'Secondary school', 'Sign-in', 'bug', 'medium', 'negative',
     'Login loop after session timeout.', (theme_ids ->> 'login')::uuid, 'bug', 'bug', 'bug', 'verified', 'Aisha (PM)', now() - interval '24 days', me, now() - interval '25 days'),
    (p, ch_form, 'sample-me-3', 'After I swapped a period with a colleague, both lessons now show on my Thursday timetable.',
     '{"sample": true}', me, now() - interval '1 day', 'clustered', 'Secondary school', 'Timetable', 'bug', 'medium', 'negative',
     'Duplicate periods after a timetable swap.', (theme_ids ->> 'timetable')::uuid, 'bug', 'bug', 'bug', 'pending', null, null, me, now() - interval '1 day'),
    (p, ch_form, 'sample-me-4', 'Please add a way to mark the whole class present and then untick the absent ones.',
     '{"sample": true}', me, now() - interval '30 days', 'clustered', 'Secondary school', 'Attendance', 'feature_request', 'low', 'neutral',
     'Mark-all-present button.', (theme_ids ->> 'bulk')::uuid, 'feature', 'feature', 'feature', 'verified', 'Aisha (PM)', now() - interval '29 days', me, now() - interval '30 days'),
    (p, ch_form, 'sample-me-5', 'Could we export marks to Excel? My HOD keeps asking for the raw data.',
     '{"sample": true}', me, now() - interval '100 days', 'clustered', 'Secondary school', 'Marks entry', 'feature_request', 'low', 'neutral',
     'Export marks to Excel.', (theme_ids ->> 'excel')::uuid, 'feature', 'feature', 'feature', 'verified', 'Aisha (PM)', now() - interval '99 days', me, now() - interval '100 days');

  -- ── recount every sample theme ─────────────────────────────────────────────
  perform recompute_theme(value::uuid) from jsonb_each_text(theme_ids);

  -- ── prioritisation: effort sizes, decisions and goals (needs 0006) ────────
  -- Impact and urgency are calculated by Pulse the first time a page loads.
  if exists (select 1 from information_schema.columns where table_name = 'themes' and column_name = 'effort') then
    update themes t set effort = v.effort, effort_source = v.src, effort_set_by = v.who, effort_set_at = now() - interval '3 days',
                        decision = v.decision, decided_by = case when v.decision is not null then 'Aisha (PM)' end,
                        fits_goals = v.fits
    from (values
      ('att',       'm',  'engineer', 'Wei Jie (Eng)', 'now',     true),
      ('marks',     'm',  'engineer', 'Wei Jie (Eng)', null,      false),
      ('login',     's',  'engineer', 'Wei Jie (Eng)', 'now',     false),
      ('report',    's',  'engineer', 'Wei Jie (Eng)', 'now',     false),
      ('timetable', 'm',  'engineer', 'Ravi (Eng)',    'next',    false),
      ('attach',    's',  'engineer', 'Ravi (Eng)',    'later',   false),
      ('contrast',  's',  'pm',       'Aisha (PM)',    'not_now', false),
      ('cca',       's',  'engineer', 'Ravi (Eng)',    'now',     false),
      ('bulk',      'm',  'engineer', 'Wei Jie (Eng)', 'next',    true),
      ('copy',      'l',  'engineer', 'Ravi (Eng)',    null,      true),
      ('excel',     'm',  'engineer', 'Ravi (Eng)',    'now',     false),
      ('offline',   'xl', 'engineer', 'Wei Jie (Eng)', 'not_now', false),
      ('remind',    's',  'pm',       'Aisha (PM)',    null,      false),
      ('dark',      null, null,       null,            null,      false),
      ('share',     null, null,       null,            null,      false),
      ('weekly',    'm',  'pm',       'Aisha (PM)',    'later',   false)
    ) as v(key, effort, src, who, decision, fits)
    where t.id = (theme_ids ->> v.key)::uuid;
    update themes set scored_at = null where id in (select value::uuid from jsonb_each_text(theme_ids));
  end if;

  -- ── source register (channels + places not connected yet) ──────────────────
  insert into sources (product_id, name, kind, owner, channel_id, status, notes) values
    (p, 'Pulse feedback form (sample)',    'form',     'Aisha (PM)', ch_form,     'connected', 'Sample data'),
    (p, 'FormSG termly survey (sample)',   'formsg',   'Aisha (PM)', ch_survey,   'connected', 'Sample data'),
    (p, 'Email forward (sample)',          'email',    'Aisha (PM)', ch_email,    'connected', 'Sample data'),
    (p, 'Shared mailbox (sample)',         'mailbox',  'IT (Mailbox team)', ch_mailbox, 'connected', 'Sample data'),
    (p, 'Term 2 teacher survey (sample)',  'survey',   'Research team', ch_import, 'imported', 'Sample data · exported each term as Excel'),
    (p, 'School IT help desk (sample)',    'helpdesk', 'Help desk',  ch_helpdesk, 'imported', 'Sample data · weekly CSV export'),
    (p, 'HQ escalations inbox',            'escalation', 'Directors'' office', null, 'not_connected', 'Sample data · forwarded ad hoc by leaders'),
    (p, 'Teacher Telegram group',          'chat',     'Community lead', null,    'not_connected', 'Sample data · informal, about 800 members'),
    (p, 'Cluster meeting notes',           'other',    'Cluster reps',   null,    'not_connected', 'Sample data · minutes shared monthly')
  on conflict (channel_id) do nothing;

  -- ── tickets ────────────────────────────────────────────────────────────────
  insert into tickets (product_id, theme_id, status, title, body, jira_key, url, filed_by, filed_at, reports_at_last_update) values
    (p, (theme_ids ->> 'att')::uuid, 'filed', 'Attendance fails to save on iPad Safari',
     E'Summary\nAttendance marked on iPad Safari is lost after pressing Save.\n\nEvidence\n21 reports from 20 teachers across 4 channels; severity 3.2 of 4; rising this week.\n\nSuggested next step\nReproduce on iPadOS Safari, add autosave with retry.',
     'TW-412', 'https://example.atlassian.net/browse/TW-412', 'Aisha (PM)', now() - interval '6 days', 14),
    (p, (theme_ids ->> 'cca')::uuid, 'filed', 'CCA attendance export omits mid-year joiners',
     E'Summary\nStudents who joined a CCA mid-year are missing from the export.\n\nEvidence\n6 reports from 6 teachers.\n\nSuggested next step\nCheck the membership date filter in the export query.',
     'TW-398', 'https://example.atlassian.net/browse/TW-398', 'Aisha (PM)', now() - interval '10 days', 6),
    (p, (theme_ids ->> 'marks')::uuid, 'draft', 'Marks entry times out for classes of 35+ students',
     E'Summary\nSaving marks for large classes fails with a timeout and the teacher loses their work.\n\nEvidence\n14 reports from 13 teachers across 4 channels; severity 3.0 of 4.\n\nWhat users report\n- Timeout only on the biggest classes\n- All unsaved marks are lost\n- Teachers now save in small batches as a workaround\n\nSuggested next step\nSave marks per row or in batches; show progress.\n\nLink\nhttps://pulse-lilac-eight-43.vercel.app/backlog',
     null, null, null, null, 13),
    (p, (theme_ids ->> 'remind')::uuid, 'draft', 'Remind teachers about marks not yet submitted',
     E'Summary\nTeachers ask for a reminder before the marks deadline listing classes with missing marks.\n\nEvidence\n8 requests from 8 teachers.\n\nSuggested next step\nEmail reminder 3 days before the deadline.',
     null, null, null, null, 8);

  -- ── notifications already sent (shows "emailed" counts on themes) ──────────
  insert into notifications (product_id, theme_id, recipient, kind, status, sent_at)
    select distinct p, theme_id, submitter_email, 'fixed', 'sent', now() - interval '12 days'
    from feedback where theme_id = (theme_ids ->> 'login')::uuid
  on conflict do nothing;
  insert into notifications (product_id, theme_id, recipient, kind, status, sent_at)
    select distinct p, theme_id, submitter_email, 'released', 'sent', now() - interval '6 days'
    from feedback where theme_id = (theme_ids ->> 'excel')::uuid
  on conflict do nothing;

  -- ── suggested actions this week ────────────────────────────────────────────
  insert into insights (product_id, kind, content, generated_at) values (p, 'weekly_actions', jsonb_build_object('actions', jsonb_build_array(
    jsonb_build_object('kind', 'bug', 'title', 'Fix attendance saving on iPad',
      'detail', '21 reports from 20 teachers, most in the last 2 weeks; teachers are redoing attendance on laptops.', 'theme_id', theme_ids ->> 'att'),
    jsonb_build_object('kind', 'regression', 'title', 'Re-fix the report book term label',
      'detail', 'Fixed 20 days ago but reported again twice since; parents are noticing.', 'theme_id', theme_ids ->> 'report'),
    jsonb_build_object('kind', 'feature', 'title', 'Ship "mark all present"',
      'detail', 'Most requested idea (25 teachers across every school level); already planned.', 'theme_id', theme_ids ->> 'bulk')
  )), now() - interval '1 day');

  -- ── reports ────────────────────────────────────────────────────────────────
  insert into reports (product_id, kind, period_start, period_end, content, status, recipients, sent_by, sent_at) values
    (p, 'weekly', (date_trunc('week', now()) - interval '7 days')::date, date_trunc('week', now())::date,
     E'# Teacher''s Workspace — weekly digest\n\nLast week · Draft written by AI from Pulse data; review before sending.\n\n## Summary\n\nFeedback rose to 31 items, driven by the iPad attendance bug, which is now being fixed (TW-412). Demand for "mark all present" keeps growing and it is planned. The report book term label regressed after last month''s fix.\n\n| Measure | Count |\n| --- | --- |\n| Total feedback | 31 |\n| Bug reports | 18 |\n| Feature suggestions | 10 |\n| Other (praise, questions) | 3 |\n| Verified by a PM | 24 |\n\n## Top bugs\n\n1. Attendance doesn''t save on iPad Safari — 9 reports, severity 3.2, being fixed\n2. Marks entry times out for large classes — 4 reports, severity 3.0, open\n3. Report book PDF shows the wrong term — 2 reports, regression\n\n## Top feature requests\n\n1. Mark the whole class present in one tap — 5 requests\n2. Copy a lesson plan to another class — 3 requests\n\n## What''s landing well\n\n- The new dashboard: 3 teachers said it is faster and easier to use.\n- Export marks to Excel, released 6 days ago, has had no complaints.\n\n## Suggested priority changes\n\n- Move the report book regression above the timetable bug; parents are affected.\n- File the drafted marks-timeout ticket; it has crossed the threshold.\n\n## Where feedback came from\n\n- Pulse feedback form: 19\n- FormSG termly survey: 5\n- Shared mailbox: 4\n- Email forward: 3',
     'sent', 'director.sample@moe.gov.sg, hod-it.sample@moe.gov.sg', 'Aisha (PM)', date_trunc('week', now()) + interval '2 hours'),
    (p, 'weekly', date_trunc('week', now())::date, (date_trunc('week', now()) + interval '7 days')::date,
     E'# Teacher''s Workspace — weekly digest\n\nThis week so far · Draft written by AI from Pulse data; review before sending.\n\n## Summary\n\nIPad attendance reports are slowing now that a fix is in progress. Marks-entry timeouts are the biggest open bug without a ticket.\n\n| Measure | Count |\n| --- | --- |\n| Total feedback | 14 |\n| Bug reports | 8 |\n| Feature suggestions | 5 |\n| Other (praise, questions) | 1 |\n| Verified by a PM | 6 |\n\n## Top bugs\n\n1. Attendance doesn''t save on iPad Safari — 5 reports, being fixed\n2. Marks entry times out for large classes — 3 reports, open\n\n## Top feature requests\n\n1. Mark the whole class present in one tap — 3 requests\n\n## Suggested priority changes\n\n- File the marks-timeout ticket this week.',
     'draft', 'director.sample@moe.gov.sg, hod-it.sample@moe.gov.sg', null, null),
    (p, 'monthly', date_trunc('month', now() - interval '1 month')::date, date_trunc('month', now())::date,
     E'# Teacher''s Workspace — monthly readout\n\nLast month · Draft written by AI from Pulse data; review before sending.\n\n## Summary\n\n96 pieces of feedback from 7 sources. 62% arrived through the Pulse form, up from 18% four months ago. Two bugs were fixed and one feature was released; the 14-day decision rate was 71%.\n\n| Measure | Count |\n| --- | --- |\n| Total feedback | 96 |\n| Bug reports | 51 |\n| Feature suggestions | 36 |\n| Other (praise, questions) | 9 |\n| Verified by a PM | 88 |\n\n## Top bugs\n\n1. Attendance doesn''t save on iPad Safari — 16 reports\n2. Marks entry times out for large classes — 9 reports\n3. CCA attendance export misses some students — 6 reports\n\n## Top feature requests\n\n1. Mark the whole class present in one tap — 12 requests\n2. Copy a lesson plan to another class — 7 requests\n\n## Closed this period\n\n- Fixed: Login loop after the session times out\n- Released: Export marks to Excel',
     'draft', 'director.sample@moe.gov.sg', null, null);

  -- ── staff (fictional) ──────────────────────────────────────────────────────
  insert into staff (email, name, role) values
    ('aisha.pm.sample@moe.gov.sg',   'Aisha (PM)',       'pm'),
    ('weijie.eng.sample@moe.gov.sg', 'Wei Jie (Eng)',    'engineer'),
    ('ravi.eng.sample@moe.gov.sg',   'Ravi (Eng)',       'engineer'),
    ('director.sample@moe.gov.sg',   'Director (viewer)', 'stakeholder')
  on conflict (email) do nothing;

  -- ── activity log ───────────────────────────────────────────────────────────
  insert into audit_log (product_id, actor, action, created_at, after) values
    (p, 'Aisha (PM)',    'Imported 42 items from term2-survey.xlsx into "Term 2 teacher survey"', now() - interval '40 days', '{"sample": true}'),
    (p, 'Wei Jie (Eng)', 'Theme status open → fixed (Login loop after the session times out)',     now() - interval '12 days', '{"sample": true}'),
    (p, 'Aisha (PM)',    'Filed ticket TW-398',                                                    now() - interval '10 days', '{"sample": true}'),
    (p, 'Aisha (PM)',    'Relabelled item bug → feature',                                          now() - interval '9 days',  '{"sample": true}'),
    (p, 'Aisha (PM)',    'Theme status open → planned (Mark the whole class present in one tap)',  now() - interval '8 days',  '{"sample": true}'),
    (p, 'Aisha (PM)',    'Theme status open → released (Export marks to Excel)',                   now() - interval '6 days',  '{"sample": true}'),
    (p, 'Aisha (PM)',    'Filed ticket TW-412',                                                    now() - interval '6 days',  '{"sample": true}'),
    (p, 'Wei Jie (Eng)', 'Theme status open → being_fixed (Attendance doesn''t save on iPad Safari)', now() - interval '5 days', '{"sample": true}'),
    (p, 'Aisha (PM)',    'Moved report to another theme',                                         now() - interval '3 days',  '{"sample": true}'),
    (p, 'Aisha (PM)',    'Sent weekly digest',                                                     now() - interval '1 day',   '{"sample": true}');
end $$;

-- Quick check: how much sample data is there now?
select
  (select count(*) from feedback f join channels c on c.id = f.channel_id where c.name like '% (sample)') as sample_reports,
  (select count(*) from themes) as themes,
  (select count(*) from feedback where review_status = 'pending') as waiting_for_review;
