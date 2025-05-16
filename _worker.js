export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    async function getPassword() {
      return (await env.LINKS.get('ADMIN_PASS')) || 'KOCHIK';
    }

    async function saveLink(key, html, expireAt) {
      const data = { html, expireAt, active: true, createdAt: Date.now() };
      await env.LINKS.put(key, JSON.stringify(data));
      
      let keys = await env.LINKS.get('LINK_KEYS');
      keys = keys ? JSON.parse(keys) : [];
      if (!keys.includes(key)) {
        keys.push(key);
        await env.LINKS.put('LINK_KEYS', JSON.stringify(keys));
      }
      return key;
    }

    if (pathname === '/') {
      return new Response(loginPage(), { headers: { 'Content-Type': 'text/html' } });
    }

    if (pathname === '/auth') {
      const formData = await request.formData();
      const password = formData.get('password');
      const realPass = await getPassword();

      if (password === realPass) {
        const keysRaw = await env.LINKS.get('LINK_KEYS');
        let listHtml = '';
        if (keysRaw) {
          const keys = JSON.parse(keysRaw);
          for (const key of keys) {
            const val = await env.LINKS.get(key);
            if (!val) continue;
            const parsed = JSON.parse(val);
            const createdDate = new Date(parsed.createdAt);
            const expireDate = new Date(parsed.expireAt);
            const timeLeft = parsed.expireAt > Date.now() 
              ? `${Math.ceil((parsed.expireAt - Date.now()) / (1000 * 60 * 60 * 24))} days left` 
              : 'Expired';
            
            listHtml += `
              <li>
                <strong>${key}</strong> - 
                <a href="/${key}" target="_blank">Visit</a> | 
                Status: <span class="status-${parsed.active ? 'active' : 'inactive'}">${parsed.active ? 'Active' : 'Inactive'}</span> | 
                <a href="/toggle?key=${key}" class="toggle-btn">Toggle</a> | 
                Created: ${createdDate.toLocaleString()} | 
                Expires: ${expireDate.toLocaleString()} (${timeLeft})
              </li>`;
          }
        }
        return new Response(dashboardPage(listHtml), { headers: { 'Content-Type': 'text/html' } });
      } else {
        return new Response('<script>alert("Wrong Password");location.href="/"</script>', { headers: { 'Content-Type': 'text/html' } });
      }
    }

    if (pathname === '/create' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('htmlfile');
        const path = formData.get('path');
        const name = formData.get('customname');
        const days = parseInt(formData.get('days')) || 0;
        const minutes = parseInt(formData.get('minutes')) || 0;

        if (!file || !path || !name || name.length !== 8) {
          return new Response('Invalid Input', { status: 400 });
        }

        const key = `${path}/${name}`;
        const existing = await env.LINKS.get(key);
        if (existing) {
          return new Response('<script>alert("Duplicate name");history.back()</script>', { headers: { 'Content-Type': 'text/html' } });
        }

        const htmlContent = await file.text();
        const expireAt = Date.now() + ((days * 1440 + minutes) * 60 * 1000);
        await saveLink(key, htmlContent, expireAt);

        // Return JSON response for AJAX handling
        return new Response(JSON.stringify({
          success: true,
          link: `${url.origin}/${key}`,
          key: key,
          expireAt: expireAt
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (pathname === '/toggle') {
      const key = url.searchParams.get('key');
      const data = await env.LINKS.get(key);
      if (data) {
        const parsed = JSON.parse(data);
        parsed.active = !parsed.active;
        await env.LINKS.put(key, JSON.stringify(parsed));
        
        // Return JSON response for AJAX handling
        return new Response(JSON.stringify({
          success: true,
          key: key,
          active: parsed.active
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: false,
        error: 'Key not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const key = pathname.slice(1);
    const data = await env.LINKS.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      if (Date.now() > parsed.expireAt || !parsed.active) {
        return new Response(expiredPage(), { 
          status: 410,
          headers: { 'Content-Type': 'text/html' } 
        });
      }
      return new Response(parsed.html, { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('Not Found', { status: 404 });
  }
};

function loginPage() {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login</title>
    <style>
      body { background: #f7f7f7; font-family: Arial, sans-serif; padding: 5vh 0; text-align: center; }
      input, button { padding: 12px 15px; margin: 10px; border-radius: 8px; font-size: 16px; width: 80%; max-width: 300px; }
      button { background-color: #28c76f; color: white; border: none; cursor: pointer; }
      button:hover { background-color: #20b763; }
    </style>
  </head>
  <body>
    <h2>Login</h2>
    <form method="POST" action="/auth">
      <input name="password" placeholder="Enter Password" required type="password">
      <button type="submit">Access</button>
    </form>
  </body>
  </html>
  `;
}

function dashboardPage(listHtml) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard</title>
    <style>
      body { background: #f7f7f7; font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
      input, select, button, textarea { padding: 12px 15px; margin: 10px; width: 100%; max-width: 400px; border-radius: 8px; font-size: 16px; border: 1px solid #ddd; }
      button { background-color: #007bff; color: white; border: none; cursor: pointer; transition: all 0.3s; }
      button:hover { background-color: #0056b3; }
      button:disabled { background-color: #cccccc; cursor: not-allowed; }
      .form-section { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
      ul { list-style: none; padding: 0; }
      li { background: #fff; padding: 15px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .status-active { color: #28a745; font-weight: bold; }
      .status-inactive { color: #dc3545; font-weight: bold; }
      .toggle-btn { color: #ffc107; font-weight: bold; text-decoration: none; }
      .toggle-btn:hover { text-decoration: underline; }
      #linkResult { margin: 20px 0; padding: 15px; background: #e9ffe9; border-radius: 8px; display: none; }
      #linkResult a { color: #007bff; text-decoration: none; }
      #linkResult a:hover { text-decoration: underline; }
      .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(255,255,255,.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s ease-in-out infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <h2>Create New HTML Link</h2>
    <div class="form-section">
      <form id="createForm" method="POST" action="/create" enctype="multipart/form-data">
        <input type="file" name="htmlfile" required accept=".html,.htm"><br>
        <div style="display: flex; gap: 10px;">
          <div style="flex: 1;">
            <input type="number" name="days" placeholder="Days" min="0"><br>
          </div>
          <div style="flex: 1;">
            <input type="number" name="minutes" placeholder="Minutes" min="0"><br>
          </div>
        </div>
        <select name="path">
          <option value="sub">sub</option>
          <option value="link">link</option>
          <option value="uploads">uploads</option>
          <option value="free">free</option>
        </select><br>
        <input name="customname" pattern=".{8,8}" placeholder="8-digit name" required><br>
        <button type="submit" id="submitBtn">Create</button>
      </form>
      <div id="linkResult"></div>
    </div>
    
    <hr>
    
    <h3>All Links</h3>
    <div class="form-section">
      <input type="text" id="searchInput" placeholder="Search links...">
      <ul id="linksList">${listHtml}</ul>
    </div>
    
    <script>
      document.getElementById('createForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = document.getElementById('submitBtn');
        const originalBtnText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<span class="loading"></span> Creating...';
        submitBtn.disabled = true;
        
        try {
          const formData = new FormData(form);
          const response = await fetch(form.action, {
            method: 'POST',
            body: formData
          });
          
          const result = await response.json();
          
          if (result.success) {
            const linkResult = document.getElementById('linkResult');
            linkResult.innerHTML = \`
              <strong>Link created successfully!</strong><br>
              <a href="\${result.link}" target="_blank">\${result.link}</a><br>
              Expires on: \${new Date(result.expireAt).toLocaleString()}
            \`;
            linkResult.style.display = 'block';
            
            // Add to the list immediately
            const linksList = document.getElementById('linksList');
            const newItem = document.createElement('li');
            newItem.innerHTML = \`
              <strong>\${result.key}</strong> - 
              <a href="\${result.link}" target="_blank">Visit</a> | 
              Status: <span class="status-active">Active</span> | 
              <a href="/toggle?key=\${result.key}" class="toggle-btn">Toggle</a> | 
              Created: \${new Date().toLocaleString()} | 
              Expires: \${new Date(result.expireAt).toLocaleString()} (\${Math.ceil((result.expireAt - Date.now()) / (1000 * 60 * 60 * 24))} days left)
            \`;
            linksList.prepend(newItem);
            
            // Add click handler for the new toggle button
            newItem.querySelector('.toggle-btn').addEventListener('click', async function(e) {
              e.preventDefault();
              await toggleLink(result.key, newItem);
            });
            
            form.reset();
          } else {
            alert('Error: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          alert('Error: ' + error.message);
        } finally {
          submitBtn.innerHTML = originalBtnText;
          submitBtn.disabled = false;
        }
      });
      
      // Add click handlers for all toggle buttons
      document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
          e.preventDefault();
          const key = this.getAttribute('href').split('=')[1];
          const listItem = this.closest('li');
          await toggleLink(key, listItem);
        });
      });
      
      async function toggleLink(key, listItem) {
        const statusSpan = listItem.querySelector('.status-active, .status-inactive');
        const toggleBtn = listItem.querySelector('.toggle-btn');
        
        try {
          const response = await fetch(\`/toggle?key=\${key}\`);
          const result = await response.json();
          
          if (result.success) {
            if (result.active) {
              statusSpan.className = 'status-active';
              statusSpan.textContent = 'Active';
            } else {
              statusSpan.className = 'status-inactive';
              statusSpan.textContent = 'Inactive';
            }
          } else {
            alert('Error toggling link');
          }
        } catch (error) {
          alert('Error: ' + error.message);
        }
      }
      
      // Search functionality
      document.getElementById('searchInput').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const items = document.getElementById('linksList').getElementsByTagName('li');
        
        Array.from(items).forEach(item => {
          const text = item.textContent.toLowerCase();
          if (text.includes(searchTerm)) {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    </script>
  </body>
  </html>
  `;
}

function expiredPage() {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Expired</title>
    <style>
      body { 
        background: #f7f7f7; 
        font-family: Arial, sans-serif; 
        display: flex; 
        justify-content: center; 
        align-items: center; 
        height: 100vh; 
        margin: 0; 
        text-align: center;
      }
      .container {
        background: white;
        padding: 30px;
        border-radius: 10px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        max-width: 500px;
        width: 90%;
      }
      h1 {
        color: #dc3545;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Link Expired or Inactive</h1>
      <p>This link has either expired or been deactivated by the administrator.</p>
      <p>Please contact the link owner if you need access.</p>
    </div>
  </body>
  </html>
  `;
}