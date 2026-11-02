-- Editable SVG art of each slide. The owner uploads under <workspace>/svg/<post>/<batch>/slide-NN.svg.
-- Insert only: nothing is overwritten, earlier versions stay readable. The SVG never goes to Instagram; only the exported JPEG does.
create policy pulse_svg_slides_upload on storage.objects for insert to authenticated with check (
 bucket_id='pulse-private' and (storage.foldername(name))[2]='svg' and lower(storage.extension(name))='svg'
 and (storage.foldername(name))[1] in (select id::text from public.pulse_workspaces where owner_id=(select auth.uid()))
);
