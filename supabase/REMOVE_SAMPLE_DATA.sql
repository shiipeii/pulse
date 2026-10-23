-- Removes everything SAMPLE_DATA.sql added. Your own real data is untouched.
do $$
declare p uuid;
begin
  select id into p from products where slug = 'tw';
  delete from themes where product_id = p and id in (
    select f.theme_id from feedback f join channels c on c.id = f.channel_id
    where c.product_id = p and c.name like '% (sample)' and f.theme_id is not null);
  delete from channels  where product_id = p and name like '% (sample)';
  delete from sources   where product_id = p and notes like 'Sample data%';
  delete from reports   where product_id = p and recipients like '%.sample@%';
  delete from insights  where product_id = p and kind = 'weekly_actions';
  delete from audit_log where product_id = p and after ->> 'sample' = 'true';
  delete from staff     where email like '%.sample@moe.gov.sg';
end $$;
select count(*) as reports_left from feedback;
