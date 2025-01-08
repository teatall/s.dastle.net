/**
 * @api {post} /create Create
 */

function generateRandomString(length) {
    const characters = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
}

export async function onRequest(context) {
    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const { request, env } = context;
    const originurl = new URL(request.url);
    const clientIP = request.headers.get("x-forwarded-for") || request.headers.get("clientIP");
    const userAgent = request.headers.get("user-agent");
    const origin = `${originurl.protocol}//${originurl.hostname}`

    const options = {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    const timedata = new Date();
    const formattedDate = new Intl.DateTimeFormat('zh-CN', options).format(timedata);
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };

    try {
        const { url, slug } = await request.json();

        if (!url) {
            return Response.json({ 
                message: 'Missing required parameter: url.' 
            }, {
                headers: corsHeaders,
                status: 400
            });
        }

        // URL format check
        if (!/^https?:\/\/.{3,}/.test(url)) {
            return Response.json({ 
                message: 'Illegal format: url.' 
            }, {
                headers: corsHeaders,
                status: 400
            });
        }

        // Custom slug length check
        if (slug && (slug.length < 2 || slug.length > 10 || /.+\.[a-zA-Z]+$/.test(slug))) {
            return Response.json({ 
                message: 'Illegal length: slug, (>= 2 && <= 10), or not ending with a file extension.' 
            }, {
                headers: corsHeaders,
                status: 400
            });
        }

        // Check for self-referencing URLs
        const bodyUrl = new URL(url);
        if (bodyUrl.hostname === originurl.hostname) {
            return Response.json({ 
                message: 'You cannot shorten a link to the same domain.' 
            }, {
                headers: corsHeaders,
                status: 400
            });
        }

        // If custom slug provided
        if (slug) {
            const stmt = await env.DB.prepare('SELECT url as existUrl FROM links WHERE slug = ?');
            const existUrl = await stmt.bind(slug).first();

            // Same URL & slug combination
            if (existUrl && existUrl.existUrl === url) {
                return Response.json({ 
                    slug, 
                    link: `${origin}/${slug}` 
                }, {
                    headers: corsHeaders
                });
            }

            // Slug already exists
            if (existUrl) {
                return Response.json({ 
                    message: 'Slug already exists.' 
                }, {
                    headers: corsHeaders
                });
            }
        }

        // Check if URL already exists
        const stmt = await env.DB.prepare('SELECT slug as existSlug FROM links WHERE url = ?');
        const existSlug = await stmt.bind(url).first();

        // URL exists and no custom slug requested
        if (existSlug && !slug) {
            return Response.json({ 
                slug: existSlug.existSlug, 
                link: `${origin}/${existSlug.existSlug}` 
            }, {
                headers: corsHeaders
            });
        }

        // Generate or use provided slug
        const finalSlug = slug || generateRandomString(6);

        // Insert new link
        const insertStmt = await env.DB.prepare(`
            INSERT INTO links (url, slug, ip, status, ua, create_time) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        await insertStmt.bind(url, finalSlug, clientIP, 1, userAgent, formattedDate).run();

        return Response.json({ 
            slug: finalSlug, 
            link: `${origin}/${finalSlug}` 
        }, {
            headers: corsHeaders
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ 
            message: 'Internal server error.' 
        }, {
            headers: corsHeaders,
            status: 500
        });
    }
}