import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { event, data, old_data } = await req.json();

    if (!data || !data.status) {
      return Response.json({ error: "Invalid application data" }, { status: 400 });
    }

    const taskTemplates: Record<string, Array<{ title: string; description: string; category: string; role_title: string; priority: string }>> = {
      interested: [
        {
          title: `Research ${data.company} for ${data.role_title}`,
          description: `Gather company background, recent news, and culture insights`,
          category: "application",
          role_title: data.role_title,
          priority: "high",
        },
        {
          title: `Tailor CV for ${data.role_title} at ${data.company}`,
          description: `Customize CV to match job description and company values`,
          category: "cv",
          role_title: data.role_title,
          priority: "high",
        },
      ],
      preparing: [
        {
          title: `Review job description for ${data.role_title}`,
          description: `Deep dive into required skills and responsibilities`,
          category: "application",
          role_title: data.role_title,
          priority: "high",
        },
        {
          title: `Identify proof points for key skills`,
          description: `Find projects and experiences that demonstrate required skills`,
          category: "project",
          role_title: data.role_title,
          priority: "medium",
        },
      ],
      applied: [
        {
          title: `Follow up on ${data.role_title} application`,
          description: `Plan follow-up with recruiter in 5-7 days`,
          category: "application",
          role_title: data.role_title,
          priority: "medium",
        },
      ],
      interviewing: [
        {
          title: `Prepare for ${data.interview_stage || "next"} interview at ${data.company}`,
          description: `Practice answers and prepare thoughtful questions`,
          category: "application",
          role_title: data.role_title,
          priority: "high",
        },
        {
          title: `Practice behavioral questions for ${data.role_title}`,
          description: `Prepare STAR method answers for common questions`,
          category: "application",
          role_title: data.role_title,
          priority: "high",
        },
        {
          title: `Prepare technical assessment for ${data.company}`,
          description: `Review technical requirements and practice relevant skills`,
          category: "skill",
          role_title: data.role_title,
          priority: "high",
        },
      ],
      offer: [
        {
          title: `Evaluate offer from ${data.company}`,
          description: `Review compensation, benefits, growth opportunities`,
          category: "application",
          role_title: data.role_title,
          priority: "high",
        },
        {
          title: `Negotiate if needed for ${data.role_title}`,
          description: `Prepare negotiation talking points if appropriate`,
          category: "application",
          role_title: data.role_title,
          priority: "medium",
        },
      ],
      rejected: [
        {
          title: `Debrief ${data.company} rejection`,
          description: `Request feedback and identify improvements`,
          category: "application",
          role_title: data.role_title,
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
      const { error: insertError } = await supabase.from("tasks").insert(
        tasksToCreate.map((task) => ({
          ...task,
          user_id: user.id,
          is_complete: false,
        }))
      );
      if (insertError) {
        console.error("Error inserting tasks:", insertError);
        return Response.json({ error: insertError.message }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      tasksCreated: tasksToCreate.length,
      status: data.status,
      company: data.company,
      role: data.role_title,
    });
  } catch (error) {
    console.error("Error generating application tasks:", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
