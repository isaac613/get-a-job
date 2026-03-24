import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_CALLS = 20;
const RATE_LIMIT_WINDOW = 3600; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client for token validation — anon key + user token (respects RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for elevated operations (rate limiting, DB writes)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limiting
    const { data: allowed } = await serviceClient.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_function_name: "generateApplicationTasks",
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in an hour." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    if (rawBody.length > 50_000) {
      return new Response(JSON.stringify({ error: "Request payload too large." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { event, data, old_data } = JSON.parse(rawBody);

    if (!data || !data.status) {
      return new Response(JSON.stringify({ error: "Invalid application data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data.id) {
      return new Response(JSON.stringify({ error: "application id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify this application belongs to the authenticated user
    const { data: appRecord } = await supabase
      .from("applications")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", user.id)
      .single();
    if (!appRecord) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Truncate string inputs to prevent oversized task titles
    const trunc = (s: unknown, max: number) => String(s ?? "").slice(0, max);
    const company = trunc(data.company, 100);
    const roleTitle = trunc(data.role_title, 100);
    const interviewStage = trunc(data.interview_stage, 100);

    const taskTemplates: Record<string, Array<{ title: string; description: string; category: string; role_title: string; priority: string }>> = {
      interested: [
        {
          title: `Research ${company} for ${roleTitle}`,
          description: `Gather company background, recent news, and culture insights`,
          category: "application",
          role_title: roleTitle,
          priority: "high",
        },
        {
          title: `Tailor CV for ${roleTitle} at ${company}`,
          description: `Customize CV to match job description and company values`,
          category: "cv",
          role_title: roleTitle,
          priority: "high",
        },
      ],
      preparing: [
        {
          title: `Review job description for ${roleTitle}`,
          description: `Deep dive into required skills and responsibilities`,
          category: "application",
          role_title: roleTitle,
          priority: "high",
        },
        {
          title: `Identify proof points for key skills`,
          description: `Find projects and experiences that demonstrate required skills`,
          category: "project",
          role_title: roleTitle,
          priority: "medium",
        },
      ],
      applied: [
        {
          title: `Follow up on ${roleTitle} application`,
          description: `Plan follow-up with recruiter in 5-7 days`,
          category: "application",
          role_title: roleTitle,
          priority: "medium",
        },
      ],
      interviewing: [
        {
          title: `Prepare for ${interviewStage || "next"} interview at ${company}`,
          description: `Practice answers and prepare thoughtful questions`,
          category: "application",
          role_title: roleTitle,
          priority: "high",
        },
        {
          title: `Practice behavioral questions for ${roleTitle}`,
          description: `Prepare STAR method answers for common questions`,
          category: "application",
          role_title: roleTitle,
          priority: "high",
        },
        {
          title: `Prepare technical assessment for ${company}`,
          description: `Review technical requirements and practice relevant skills`,
          category: "skill",
          role_title: roleTitle,
          priority: "high",
        },
      ],
      offer: [
        {
          title: `Evaluate offer from ${company}`,
          description: `Review compensation, benefits, growth opportunities`,
          category: "application",
          role_title: roleTitle,
          priority: "high",
        },
        {
          title: `Negotiate if needed for ${roleTitle}`,
          description: `Prepare negotiation talking points if appropriate`,
          category: "application",
          role_title: roleTitle,
          priority: "medium",
        },
      ],
      rejected: [
        {
          title: `Debrief ${company} rejection`,
          description: `Request feedback and identify improvements`,
          category: "application",
          role_title: roleTitle,
          priority: "low",
        },
      ],
    };

    const statusChanged = old_data && old_data.status !== data.status;
    const isNewApplication = event?.type === "create";

    let tasksToCreate: Array<{ title: string; description: string; category: string; role_title: string; priority: string }> = [];

    if (isNewApplication) {
      tasksToCreate = taskTemplates.interested || [];
    } else if (statusChanged) {
      tasksToCreate = taskTemplates[data.status] || [];
    }

    if (tasksToCreate.length > 0) {
      const { error: insertError } = await serviceClient.from("tasks").insert(
        tasksToCreate.map((task) => ({
          ...task,
          user_id: user.id,
          is_complete: false,
        }))
      );
      if (insertError) {
        console.error("Error inserting tasks:", insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      tasksCreated: tasksToCreate.length,
      status: data.status,
      company,
      role: roleTitle,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error generating application tasks:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
