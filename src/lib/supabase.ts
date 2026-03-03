import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cpzxuxoxwvjrclltprhl.supabase.co';
const supabaseKey = 'sb_publishable_UnDLl16SsqBAI3pxP7XtNg_FS54hhWC';

export const supabase = createClient(supabaseUrl, supabaseKey);
