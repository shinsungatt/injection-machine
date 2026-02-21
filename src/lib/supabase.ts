import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export type Machine = {
  id: string
  name: string
  manufacturer: string
  clamping_force_ton: number
  shot_weight_max_g: number
  injection_pressure_max_mpa: number
  platen_width_mm: number
  platen_height_mm: number
  tie_bar_x_mm: number
  tie_bar_y_mm: number
  daylight_max_mm: number
  screw_diameter_mm: number
  notes: string | null
  is_active: boolean
  created_at: string
}

export type Project = {
  id: string
  name: string
  model_name: string
  description: string | null
  status: 'draft' | 'analyzing' | 'completed'
  created_at: string
  updated_at: string
}

export type Part = {
  id: string
  project_id: string
  part_number: string
  part_name: string
  material: string
  part_weight_g: number
  projected_area_cm2: number
  cavity_count: number
  runner_weight_g: number
  mold_width_mm: number | null
  mold_height_mm: number | null
  mold_depth_mm: number | null
  cycle_time_sec: number | null
  drawing_file_url: string | null
  cad_file_url: string | null
  created_at: string
}

export type Recommendation = {
  id: string
  part_id: string
  machine_id: string
  required_clamping_force_ton: number
  required_shot_weight_g: number
  utilization_clamping_pct: number
  utilization_shot_pct: number
  is_recommended: boolean
  rank: number
  notes: string | null
  created_at: string
  machine?: Machine
}
