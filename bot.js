const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const SENTINET_KEY = process.env.SENTINET_API_KEY || '';

// ── Cache token ───────────────────────────────────────────────────────────────
let tokenCache = { token: null, expires: 0 };

// ── Headers navigateur ────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Referer': 'https://reacher.lol/',
    'Origin': 'https://reacher.lol',
};

// ── Récupération automatique du token ────────────────────────────────────────
async function getSearchToken() {
    // Cache valide 1h
    if (tokenCache.token && Date.now() < tokenCache.expires) {
        console.log(`[TOKEN] Cache OK: ${tokenCache.token.substring(0, 20)}...`);
        return tokenCache.token;
    }

    console.log('[TOKEN] Récupération nouveau token...');

    try {
        // Étape 1: charger la page principale
        const pageRes = await axios.get('https://reacher.lol/', {
            headers: BROWSER_HEADERS,
            timeout: 15000
        });
        const html = pageRes.data;

        // Étape 2: trouver tous les fichiers JS
        const jsRegex = /src=["']([^"']*\.js[^"']*?)["']/g;
        const jsFiles = [];
        let match;
        while ((match = jsRegex.exec(html)) !== null) {
            let url = match[1];
            if (!url.startsWith('http')) url = 'https://reacher.lol' + url;
            jsFiles.push(url);
        }
        console.log(`[TOKEN] ${jsFiles.length} fichiers JS trouvés`);

        // Étape 3: chercher le token dans chaque fichier JS
        for (const jsUrl of jsFiles) {
            try {
                const jsRes = await axios.get(jsUrl, {
                    headers: BROWSER_HEADERS,
                    timeout: 10000
                });
                const jsContent = jsRes.data;

                // Cherche token hex 64 chars
                const tokenMatches = jsContent.match(/["']([a-f0-9]{64})["']/g);
                if (tokenMatches && tokenMatches.length > 0) {
                    const token = tokenMatches[0].replace(/["']/g, '');
                    tokenCache = { token, expires: Date.now() + 3600000 };
                    console.log(`[TOKEN] ✅ Trouvé dans JS: ${token.substring(0, 20)}...`);
                    return token;
                }

                // Cherche search_token= dans le JS
                const stMatch = jsContent.match(/search_token[=:]["']([a-f0-9]{64})["']/);
                if (stMatch) {
                    const token = stMatch[1];
                    tokenCache = { token, expires: Date.now() + 3600000 };
                    console.log(`[TOKEN] ✅ search_token trouvé: ${token.substring(0, 20)}...`);
                    return token;
                }
            } catch (e) {
                // continue
            }
        }

        // Étape 4: essayer de faire une requête et capturer le token depuis la réponse
        try {
            const searchRes = await axios.get('https://reacher.lol/api/search', {
                params: { nom: 'test' },
                headers: { ...BROWSER_HEADERS, 'Accept': 'application/json, */*' },
                timeout: 10000,
                validateStatus: () => true
            });
            
            const body = typeof searchRes.data === 'string' ? searchRes.data : JSON.stringify(searchRes.data);
            const match2 = body.match(/search_token[=:"\s]+([a-f0-9]{64})/);
            if (match2) {
                const token = match2[1];
                tokenCache = { token, expires: Date.now() + 3600000 };
                console.log(`[TOKEN] ✅ Token depuis réponse API: ${token.substring(0, 20)}...`);
                return token;
            }

            // Si la requête renvoie une URL de redirection avec le token
            const reqUrl = searchRes.request?.res?.responseUrl || '';
            const urlMatch = reqUrl.match(/search_token=([a-f0-9]{64})/);
            if (urlMatch) {
                const token = urlMatch[1];
                tokenCache = { token, expires: Date.now() + 3600000 };
                console.log(`[TOKEN] ✅ Token depuis URL: ${token.substring(0, 20)}...`);
                return token;
            }
        } catch (e) { }

    } catch (e) {
        console.log(`[TOKEN] ERREUR: ${e.message}`);
    }

    // Fallback: token connu (marche jusqu'à expiration)
    const fallback = '926ffefb595eb50f1c02d9862ffb3bbf4721bf108b08fda2087cb654fd2640388';
    console.log('[TOKEN] ⚠️ Utilisation token fallback');
    return fallback;
}

// ── Appel API principal ───────────────────────────────────────────────────────
async function callDB(params) {
    const results = [];
    const token = await getSearchToken();

    const searchParams = { ...params, search_token: token };
    const apiHeaders = {
        ...BROWSER_HEADERS,
        'Accept': 'application/json, */*',
    };

    // Source 1: reacher.lol/api/search
    try {
        const r = await axios.get('https://reacher.lol/api/search', {
            params: searchParams,
            headers: apiHeaders,
            timeout: 20000,
            validateStatus: () => true
        });
        console.log(`[Reacher] status=${r.status}`);
        if (r.status === 200 && r.data) {
            const raw = r.data?.data || r.data?.results || r.data?.result || (Array.isArray(r.data) ? r.data : []);
            if (raw.length > 0) {
                results.push(...raw);
                console.log(`[Reacher] ${raw.length} résultats`);
            } else {
                console.log(`[Reacher] réponse: ${JSON.stringify(r.data).substring(0, 100)}`);
            }
        } else {
            console.log(`[Reacher] erreur: ${JSON.stringify(r.data).substring(0, 100)}`);
            // Si token expiré → reset et réessai
            if (r.data?.error?.includes('token') || r.data?.error?.includes('Token') || r.data?.error?.includes('indisponible')) {
                tokenCache.expires = 0;
                const newToken = await getSearchToken();
                const r2 = await axios.get('https://reacher.lol/api/search', {
                    params: { ...params, search_token: newToken },
                    headers: apiHeaders,
                    timeout: 20000,
                    validateStatus: () => true
                });
                console.log(`[Reacher/retry] status=${r2.status}`);
                if (r2.status === 200 && r2.data) {
                    const raw2 = r2.data?.data || r2.data?.results || (Array.isArray(r2.data) ? r2.data : []);
                    results.push(...raw2);
                }
            }
        }
    } catch (e) {
        console.log(`[Reacher] ERREUR: ${e.message}`);
    }

    // Source 2: api.sentinet.nl (si clé dispo)
    if (results.length === 0 && SENTINET_KEY) {
        try {
            const r = await axios.get('https://api.sentinet.nl/search', {
                params: { ...params, api_key: SENTINET_KEY },
                headers: apiHeaders,
                timeout: 15000,
                validateStatus: () => true
            });
            if (r.status === 200 && r.data) {
                const raw = r.data?.data || r.data?.results || (Array.isArray(r.data) ? r.data : []);
                results.push(...raw);
                console.log(`[SentiNet] ${raw.length} résultats`);
            }
        } catch (e) {
            console.log(`[SentiNet] ERREUR: ${e.message}`);
        }
    }

    console.log(`[TOTAL] ${results.length} résultats`);
    return results;
}

// ── Lookup IP via ipinfo.io ───────────────────────────────────────────────────
async function lookupIP(ip) {
    try {
        const r = await axios.get(`https://ipinfo.io/${ip}/json`, { timeout: 10000 });
        return r.data;
    } catch (e) {
        return null;
    }
}

// ── Checker réseaux sociaux ───────────────────────────────────────────────────
const SOCIAL_SITES = {
    'TikTok':    'https://www.tiktok.com/@{}',
    'Instagram': 'https://www.instagram.com/{}',
    'Snapchat':  'https://www.snapchat.com/add/{}',
    'Twitter/X': 'https://twitter.com/{}',
    'YouTube':   'https://www.youtube.com/@{}',
    'GitHub':    'https://github.com/{}',
    'Reddit':    'https://www.reddit.com/user/{}',
    'Twitch':    'https://www.twitch.tv/{}',
    'Steam':     'https://steamcommunity.com/id/{}',
    'Pinterest': 'https://www.pinterest.com/{}',
    'Replit':    'https://replit.com/@{}',
    'GitLab':    'https://gitlab.com/{}',
    'Telegram':  'https://t.me/{}',
    'Roblox':    'https://www.roblox.com/user.aspx?username={}',
    'Linktree':  'https://linktr.ee/{}',
    'Medium':    'https://medium.com/@{}',
    'Cashapp':   'https://cash.app/${}',
    'Pastebin':  'https://pastebin.com/u/{}',
    'Spotify':   'https://open.spotify.com/user/{}',
    'BeReal':    'https://bere.al/{}',
};

async function checkSocial(pseudo) {
    const found = [], notFound = [];
    const checks = Object.entries(SOCIAL_SITES).map(async ([site, urlTemplate]) => {
        const url = urlTemplate.replace('{}', pseudo);
        try {
            const r = await axios.get(url, {
                timeout: 6000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                validateStatus: () => true,
                maxRedirects: 5
            });
            if (r.status === 200) found.push({ plateforme: site, url, statut: '✅ Trouvé' });
            else notFound.push({ plateforme: site, statut: '❌ Absent' });
        } catch {
            notFound.push({ plateforme: site, statut: '❌ Absent' });
        }
    });
    await Promise.all(checks);
    return [...found, ...notFound];
}

// ── Formatage résultats ───────────────────────────────────────────────────────
const FIELD_MAP = {
    adresse: 'adresse', address: 'adresse',
    adresse_ip: 'adresse_ip', ip: 'adresse_ip',
    code_postal: 'code_postal', zipcode: 'code_postal',
    email: 'email',
    hashed_password: 'hashed_password', password: 'hashed_password', hash: 'hashed_password',
    nom_affichage: 'nom_affichage', displayname: 'nom_affichage',
    nom_famille: 'nom_famille', nom: 'nom_famille', lastname: 'nom_famille',
    nom_utilisateur: 'nom_utilisateur', username: 'nom_utilisateur', pseudo: 'nom_utilisateur',
    pays: 'pays', country: 'pays',
    prenom: 'prenom', firstname: 'prenom',
    ville: 'ville', city: 'ville',
    telephone: 'telephone', phone: 'telephone',
    date_naissance: 'date_naissance',
    nir: 'nir', iban: 'iban', immat: 'immat',
    source: 'source',
    plateforme: 'plateforme', url: 'url', statut: 'statut',
    org: 'organisation', hostname: 'hostname', region: 'region',
    timezone: 'timezone', loc: 'coordonnées',
};

function formatEntry(entry) {
    const seen = new Set();
    const lines = [];
    for (const [srcKey, displayKey] of Object.entries(FIELD_MAP)) {
        const val = entry[srcKey];
        if (val && !seen.has(displayKey)) {
            seen.add(displayKey);
            lines.push(`${displayKey}: ${val}`);
        }
    }
    for (const [k, v] of Object.entries(entry)) {
        if (!FIELD_MAP[k] && v && String(v).trim()) {
            lines.push(`${k}: ${v}`);
        }
    }
    return lines.join('\n');
}

function formatAllTxt(results, searchType = '', query = '') {
    const lines = [
        '='.repeat(50),
        '       RYZEN SEARCHER — RÉSULTATS',
        '='.repeat(50),
        `Recherche : ${searchType} → ${query}`,
        `Date      : ${new Date().toLocaleString('fr-FR')}`,
        `Total     : ${results.length} résultat(s)`,
        '='.repeat(50), '',
    ];
    results.forEach((entry, i) => {
        lines.push(`===== RESULT ${i + 1} =====`);
        lines.push(formatEntry(entry));
        lines.push('');
    });
    lines.push('discord.gg/Ryzen');
    return lines.join('\n');
}

// ── Stockage sessions (pagination) ───────────────────────────────────────────
const sessions = new Map();

// ── Setup Discord client ──────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Enregistrement commandes ──────────────────────────────────────────────────
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('search')
            .setDescription('Recherche dans les bases OSINT')
            .toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commandes enregistrées');
}

// ── Build menu /search ────────────────────────────────────────────────────────
function buildSearchMenu() {
    const select = new StringSelectMenuBuilder()
        .setCustomId('ryzen_search_select')
        .setPlaceholder('Sélectionne un type de recherche...')
        .addOptions([
            { label: '→ Recherche avancée',   description: 'Toutes les bases de données',      value: 'avance',         emoji: '🔍' },
            { label: '→ Prénom + Nom',         description: 'Recherche par prénom + nom',       value: 'prenom_nom',     emoji: '👤' },
            { label: '→ Nom de naissance',     description: 'Recherche par nom de naissance',   value: 'nom_naissance',  emoji: '📛' },
            { label: '→ Date de naissance',    description: 'Format: JJ/MM/AAAA',               value: 'date_naissance', emoji: '📅' },
            { label: '→ N° Sécurité sociale',  description: 'Recherche par NIR',                value: 'secu',           emoji: '🏥' },
            { label: '→ Email',                description: 'Recherche par email',              value: 'email',          emoji: '📧' },
            { label: '→ Téléphone',            description: 'Recherche par téléphone',          value: 'telephone',      emoji: '📞' },
            { label: '→ Pseudo / Réseaux',     description: 'Pseudo + 20 réseaux sociaux',      value: 'pseudo',         emoji: '🔖' },
            { label: '→ Ville',                description: 'Recherche par ville',              value: 'ville',          emoji: '🏙️' },
            { label: "→ Nom d'affichage",      description: 'Recherche par nom affiché',        value: 'nom_affichage',  emoji: '💬' },
            { label: '→ Code Postal',          description: 'Recherche par code postal',        value: 'code_postal',    emoji: '📮' },
            { label: '→ Pays',                 description: 'Recherche par pays',               value: 'pays',           emoji: '🌍' },
            { label: '→ Adresse',              description: 'Recherche par adresse',            value: 'adresse',        emoji: '📍' },
            { label: '→ IP',                   description: 'Géoloc IPinfo + bases',            value: 'ip',             emoji: '🌐' },
            { label: '→ Véhicule',             description: 'Immatriculation ou NIV',           value: 'vehicule',       emoji: '🚗' },
            { label: '→ IBAN',                 description: 'Recherche par IBAN',               value: 'iban',           emoji: '🏦' },
        ]);

    return new ActionRowBuilder().addComponents(select);
}

// ── Build modal selon le type ─────────────────────────────────────────────────
function buildModal(type) {
    const modal = new ModalBuilder().setCustomId(`modal_${type}`);
    const components = [];

    if (type === 'avance') {
        modal.setTitle('Recherche avancée');
        components.push(
            new TextInputBuilder().setCustomId('prenom').setLabel('Prénom').setStyle(TextInputStyle.Short).setPlaceholder('Jean').setRequired(false),
            new TextInputBuilder().setCustomId('nom').setLabel('Nom').setStyle(TextInputStyle.Short).setPlaceholder('Dupont').setRequired(false),
            new TextInputBuilder().setCustomId('email').setLabel('Email').setStyle(TextInputStyle.Short).setPlaceholder('email@example.com').setRequired(false),
            new TextInputBuilder().setCustomId('telephone').setLabel('Téléphone').setStyle(TextInputStyle.Short).setPlaceholder('0612345678').setRequired(false),
            new TextInputBuilder().setCustomId('code_postal').setLabel('Code postal').setStyle(TextInputStyle.Short).setPlaceholder('75000').setRequired(false),
        );
    } else if (type === 'prenom_nom') {
        modal.setTitle('Prénom + Nom');
        components.push(
            new TextInputBuilder().setCustomId('prenom').setLabel('Prénom').setStyle(TextInputStyle.Short).setPlaceholder('Jean').setRequired(true),
            new TextInputBuilder().setCustomId('nom').setLabel('Nom').setStyle(TextInputStyle.Short).setPlaceholder('Dupont').setRequired(true),
        );
    } else if (type === 'nom_naissance') {
        modal.setTitle('Nom de naissance');
        components.push(new TextInputBuilder().setCustomId('nom').setLabel('Nom de naissance').setStyle(TextInputStyle.Short).setPlaceholder('Dupont').setRequired(true));
    } else if (type === 'date_naissance') {
        modal.setTitle('Date de naissance');
        components.push(new TextInputBuilder().setCustomId('date_naissance').setLabel('Date (JJ/MM/AAAA ou AAAA)').setStyle(TextInputStyle.Short).setPlaceholder('15/04/1985').setRequired(true));
    } else if (type === 'secu') {
        modal.setTitle('N° Sécurité sociale');
        components.push(new TextInputBuilder().setCustomId('nir').setLabel('NIR (N° de sécu)').setStyle(TextInputStyle.Short).setPlaceholder('1 90 05 75 000 000 00').setRequired(true));
    } else if (type === 'email') {
        modal.setTitle('Email');
        components.push(new TextInputBuilder().setCustomId('email').setLabel('Adresse email').setStyle(TextInputStyle.Short).setPlaceholder('email@example.com').setRequired(true));
    } else if (type === 'telephone') {
        modal.setTitle('Téléphone');
        components.push(new TextInputBuilder().setCustomId('telephone').setLabel('Numéro de téléphone').setStyle(TextInputStyle.Short).setPlaceholder('0612345678').setRequired(true));
    } else if (type === 'pseudo') {
        modal.setTitle('Pseudo / Réseaux sociaux');
        components.push(new TextInputBuilder().setCustomId('pseudo').setLabel('Pseudo / Username').setStyle(TextInputStyle.Short).setPlaceholder('darkwolf99').setRequired(true));
    } else if (type === 'ville') {
        modal.setTitle('Ville');
        components.push(new TextInputBuilder().setCustomId('ville').setLabel('Ville').setStyle(TextInputStyle.Short).setPlaceholder('PARIS').setRequired(true));
    } else if (type === 'nom_affichage') {
        modal.setTitle("Nom d'affichage");
        components.push(new TextInputBuilder().setCustomId('nom_affichage').setLabel("Nom d'affichage").setStyle(TextInputStyle.Short).setPlaceholder('Jean DUPONT').setRequired(true));
    } else if (type === 'code_postal') {
        modal.setTitle('Code Postal');
        components.push(new TextInputBuilder().setCustomId('code_postal').setLabel('Code postal').setStyle(TextInputStyle.Short).setPlaceholder('75000').setRequired(true));
    } else if (type === 'pays') {
        modal.setTitle('Pays');
        components.push(new TextInputBuilder().setCustomId('pays').setLabel('Pays').setStyle(TextInputStyle.Short).setPlaceholder('FR').setRequired(true));
    } else if (type === 'adresse') {
        modal.setTitle('Adresse');
        components.push(new TextInputBuilder().setCustomId('adresse').setLabel('Adresse complète').setStyle(TextInputStyle.Short).setPlaceholder('1 rue du stade').setRequired(true));
    } else if (type === 'ip') {
        modal.setTitle('Adresse IP');
        components.push(new TextInputBuilder().setCustomId('ip').setLabel('Adresse IP').setStyle(TextInputStyle.Short).setPlaceholder('37.35.206.126').setRequired(true));
    } else if (type === 'vehicule') {
        modal.setTitle('Véhicule');
        components.push(new TextInputBuilder().setCustomId('immat').setLabel('Immatriculation ou NIV').setStyle(TextInputStyle.Short).setPlaceholder('AB-123-CD').setRequired(true));
    } else if (type === 'iban') {
        modal.setTitle('IBAN');
        components.push(new TextInputBuilder().setCustomId('iban').setLabel('IBAN').setStyle(TextInputStyle.Short).setPlaceholder('FR76 3000 6000 0112 3456 7890 189').setRequired(true));
    }

    components.forEach(c => {
        modal.addComponents(new ActionRowBuilder().addComponents(c));
    });

    return modal;
}

// ── Build embed résultat ──────────────────────────────────────────────────────
function buildResultEmbed(results, page) {
    const entry = results[page];
    let text = formatEntry(entry);
    if (text.length > 3900) text = text.substring(0, 3900) + '\n...';

    return new EmbedBuilder()
        .setTitle('Résultat de la recherche')
        .setDescription('```\n' + text + '\n```')
        .setColor(0xFF6B00)
        .setFooter({ text: `Résultat ${page + 1}/${results.length} | discord.gg/Ryzen` });
}

// ── Build boutons pagination ──────────────────────────────────────────────────
function buildPaginationButtons(page, total, sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prev_${sessionId}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`export_${sessionId}`).setEmoji('📄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`next_${sessionId}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
    );
}

// ── Send résultats ────────────────────────────────────────────────────────────
async function sendResults(interaction, results, searchType = '', query = '') {
    if (!results || results.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('Résultat de la recherche')
            .setDescription('```\nAucun résultat trouvé.\n\n→ Vérifie l\'orthographe\n→ Essaie avec moins de critères\n→ Essaie un autre type\n```')
            .setColor(0xFF6B00)
            .setFooter({ text: 'Résultat 0/0 | discord.gg/Ryzen' });
        return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    const sessionId = Date.now().toString(36);
    sessions.set(sessionId, { results, page: 0, searchType, query });
    setTimeout(() => sessions.delete(sessionId), 300000); // 5min

    await interaction.followUp({
        embeds: [buildResultEmbed(results, 0)],
        components: [buildPaginationButtons(0, results.length, sessionId)],
        ephemeral: true
    });
}

// ── Gestion params modal ──────────────────────────────────────────────────────
async function handleModalSubmit(interaction, type) {
    await interaction.deferReply({ ephemeral: true });

    const fields = interaction.fields;
    let results = [];
    let searchType = type;
    let query = '';

    try {
        if (type === 'avance') {
            const params = {};
            const prenom = fields.getTextInputValue('prenom');
            const nom = fields.getTextInputValue('nom');
            const email = fields.getTextInputValue('email');
            const tel = fields.getTextInputValue('telephone');
            const cp = fields.getTextInputValue('code_postal');
            if (prenom) params.prenom = prenom;
            if (nom) params.nom = nom;
            if (email) params.email = email;
            if (tel) params.telephone = tel;
            if (cp) params.code_postal = cp;
            query = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' | ');
            results = await callDB(params);

        } else if (type === 'prenom_nom') {
            const prenom = fields.getTextInputValue('prenom');
            const nom = fields.getTextInputValue('nom');
            query = `${prenom} ${nom}`;
            results = await callDB({ prenom, nom });

        } else if (type === 'nom_naissance') {
            const nom = fields.getTextInputValue('nom');
            query = nom;
            results = await callDB({ nom });

        } else if (type === 'date_naissance') {
            const date = fields.getTextInputValue('date_naissance');
            query = date;
            results = await callDB({ date_naissance: date });

        } else if (type === 'secu') {
            const nir = fields.getTextInputValue('nir');
            query = nir;
            results = await callDB({ nir });

        } else if (type === 'email') {
            const email = fields.getTextInputValue('email');
            query = email;
            results = await callDB({ email });

        } else if (type === 'telephone') {
            const tel = fields.getTextInputValue('telephone');
            query = tel;
            results = await callDB({ telephone: tel });

        } else if (type === 'pseudo') {
            const pseudo = fields.getTextInputValue('pseudo');
            query = pseudo;
            const [dbRes, socialRes] = await Promise.all([callDB({ pseudo }), checkSocial(pseudo)]);
            results = [...dbRes, ...socialRes];

        } else if (type === 'ville') {
            const ville = fields.getTextInputValue('ville');
            query = ville;
            results = await callDB({ ville });

        } else if (type === 'nom_affichage') {
            const nom = fields.getTextInputValue('nom_affichage');
            query = nom;
            results = await callDB({ nom_affichage: nom });

        } else if (type === 'code_postal') {
            const cp = fields.getTextInputValue('code_postal');
            query = cp;
            results = await callDB({ code_postal: cp });

        } else if (type === 'pays') {
            const pays = fields.getTextInputValue('pays');
            query = pays;
            results = await callDB({ pays });

        } else if (type === 'adresse') {
            const adresse = fields.getTextInputValue('adresse');
            query = adresse;
            results = await callDB({ adresse });

        } else if (type === 'ip') {
            const ip = fields.getTextInputValue('ip');
            query = ip;
            const [info, dbRes] = await Promise.all([lookupIP(ip), callDB({ ip })]);
            if (info && !info.bogon) {
                results.push({
                    adresse_ip: ip,
                    pays: info.country || '',
                    ville: info.city || '',
                    region: info.region || '',
                    org: info.org || '',
                    hostname: info.hostname || '',
                    timezone: info.timezone || '',
                    loc: info.loc || '',
                });
            }
            results.push(...dbRes);

        } else if (type === 'vehicule') {
            const immat = fields.getTextInputValue('immat');
            query = immat;
            results = await callDB({ immat });

        } else if (type === 'iban') {
            const iban = fields.getTextInputValue('iban');
            query = iban;
            results = await callDB({ iban });
        }

    } catch (e) {
        console.error(`[MODAL] ERREUR: ${e.message}`);
    }

    await sendResults(interaction, results, searchType, query);
}

// ── Events Discord ────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log('╔══════════════════════════════════════╗');
    console.log(`║  ✅  RYZEN BOT connecté               ║`);
    console.log(`║  👤  ${client.user.tag.padEnd(32)}║`);
    console.log('╚══════════════════════════════════════╝');
    await registerCommands();
    client.user.setActivity('discord.gg/Ryzen • /search', { type: 3 });
});

client.on('interactionCreate', async (interaction) => {

    // ── Commande /search ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'search') {
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setDescription(
                '```\n' +
                '══════════════════════════════════════\n' +
                '           RYZEN SEARCHER\n' +
                '══════════════════════════════════════\n\n' +
                '[+] 16 types disponibles\n' +
                '[+] Multi-sources\n' +
                '[+] Export .txt\n' +
                '```'
            )
            .addFields({ name: 'Créateur:', value: '@8g7b', inline: false });

        return interaction.reply({
            embeds: [embed],
            components: [buildSearchMenu()],
            ephemeral: true
        });
    }

    // ── Select menu ───────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ryzen_search_select') {
        const type = interaction.values[0];
        const modal = buildModal(type);
        return interaction.showModal(modal);
    }

    // ── Modal submit ──────────────────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
        const type = interaction.customId.replace('modal_', '');
        return handleModalSubmit(interaction, type);
    }

    // ── Boutons pagination ────────────────────────────────────────────────────
    if (interaction.isButton()) {
        const [action, sessionId] = interaction.customId.split('_');
        const session = sessions.get(sessionId);
        if (!session) return interaction.reply({ content: 'Session expirée. Refais /search.', ephemeral: true });

        if (action === 'prev') {
            session.page = Math.max(0, session.page - 1);
        } else if (action === 'next') {
            session.page = Math.min(session.results.length - 1, session.page + 1);
        } else if (action === 'export') {
            const content = formatAllTxt(session.results, session.searchType, session.query);
            const buf = Buffer.from(content, 'utf-8');
            return interaction.reply({
                files: [{ attachment: buf, name: 'ryzen_results.txt' }],
                ephemeral: true
            });
        }

        return interaction.update({
            embeds: [buildResultEmbed(session.results, session.page)],
            components: [buildPaginationButtons(session.page, session.results.length, sessionId)],
        });
    }
});

client.login(TOKEN);
