-- Tenant zero: Teacher's Workspace (TW).
insert into products (name, slug)
values ('Teacher''s Workspace', 'tw')
on conflict (slug) do nothing;
