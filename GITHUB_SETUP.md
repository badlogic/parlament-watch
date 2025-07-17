# GitHub Action Setup Guide

## Setting up SSH access for GitHub Actions

To allow GitHub Actions to access your server, you need to configure SSH key authentication and add secrets to your GitHub repository.

### Step 1: Generate SSH Key Pair (if you don't have one)

On your local machine or server:
```bash
ssh-keygen -t rsa -b 4096 -C "github-actions@parlament-scraper"
```

This creates:
- `~/.ssh/id_rsa` (private key)
- `~/.ssh/id_rsa.pub` (public key)

### Step 2: Add Public Key to Your Server

Copy the public key to your server's authorized_keys:
```bash
# Copy public key content
cat ~/.ssh/id_rsa.pub

# On your server, add it to authorized_keys
echo "PUBLIC_KEY_CONTENT_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Step 3: Add GitHub Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

1. **SSH_PRIVATE_KEY**
   - Copy the entire content of your private key file (`~/.ssh/id_rsa`)
   - Include the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines

2. **HOST**
   - Your server's hostname or IP address
   - Example: `mariozechner.at` or `192.168.1.100`

3. **USERNAME**
   - Your SSH username on the server
   - Example: `badlogic`

### Step 4: Test SSH Connection

Test that SSH works with your key:
```bash
ssh -i ~/.ssh/id_rsa username@your-server.com
```

### Step 5: Verify Server Directory

Make sure the target directory exists and has proper permissions:
```bash
ssh username@your-server.com
mkdir -p /home/badlogic/mariozechner.at/html/projects/parlament-absences
chmod 755 /home/badlogic/mariozechner.at/html/projects/parlament-absences
```

### Step 6: Test the Workflow

You can manually trigger the workflow from GitHub:
1. Go to Actions tab in your repository
2. Select "Nightly Parliament Absence Scraper"
3. Click "Run workflow"

## Workflow Details

- **Schedule**: Runs every night at 2 AM UTC
- **Output**: 
  - `index.html` → Main report page
  - `parliament_absences_XXVIII.json` → Raw data
- **Upload Location**: `/home/badlogic/mariozechner.at/html/projects/parlament-absences/`
- **URL**: `https://mariozechner.at/projects/parlament-absences/`

## Troubleshooting

### Common Issues:

1. **Permission Denied**: Check SSH key permissions (should be 600)
2. **Host Key Verification Failed**: The workflow includes `ssh-keyscan` to handle this
3. **Directory Access**: Ensure the target directory exists and is writable
4. **Network Issues**: GitHub Actions might have network restrictions

### Debug Steps:

1. Check Actions logs in GitHub
2. Test SSH connection manually
3. Verify file permissions on server
4. Check server logs (`/var/log/auth.log`)