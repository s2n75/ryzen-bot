"""
╔══════════════════════════════════════════════════════════════╗
║                  RYZEN BOT — OSINT                           ║
║  Fix: app ne répond plus | Multi-sources | Réseaux sociaux   ║
╚══════════════════════════════════════════════════════════════╝
"""

import discord
from discord import app_commands, ui
from discord.ext import commands
import aiohttp
import asyncio
import os
import io
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN    = os.getenv("DISCORD_TOKEN", "")
SENTINET_API_KEY = os.getenv("SENTINET_API_KEY", "")
IPINFO_TOKEN     = os.getenv("IPINFO_TOKEN", "")

# ── URLs ──────────────────────────────────────────────────────────────────────
REACHER_URL   = "https://reacher-w2dn.onrender.com"
SENTINET_URL  = "https://fd54a71c.sentinet.nl/bde"
SENTINET2_URL = "https://api.sentinet.nl/search"
IPINFO_URL    = "https://ipinfo.io/{ip}/json"

ORANGE = 0xFF6B00
BLACK  = 0x000000

# ── Réseaux sociaux à checker ─────────────────────────────────────────────────
SOCIAL_SITES = {
    "TikTok":      "https://www.tiktok.com/@{}",
    "Instagram":   "https://www.instagram.com/{}",
    "Snapchat":    "https://www.snapchat.com/add/{}",
    "Twitter/X":   "https://twitter.com/{}",
    "YouTube":     "https://www.youtube.com/@{}",
    "Facebook":    "https://www.facebook.com/{}",
    "GitHub":      "https://github.com/{}",
    "Reddit":      "https://www.reddit.com/user/{}",
    "Twitch":      "https://www.twitch.tv/{}",
    "Steam":       "https://steamcommunity.com/id/{}",
    "Pinterest":   "https://www.pinterest.com/{}",
    "LinkedIn":    "https://www.linkedin.com/in/{}",
    "Spotify":     "https://open.spotify.com/user/{}",
    "Replit":      "https://replit.com/@{}",
    "GitLab":      "https://gitlab.com/{}",
    "Pastebin":    "https://pastebin.com/u/{}",
    "Dev.to":      "https://dev.to/{}",
    "Medium":      "https://medium.com/@{}",
    "Linktree":    "https://linktr.ee/{}",
    "Keybase":     "https://keybase.io/{}",
    "Cashapp":     "https://cash.app/${}",
    "Roblox":      "https://www.roblox.com/user.aspx?username={}",
    "Telegram":    "https://t.me/{}",
    "Discord":     "https://discord.com/users/{}",
    "BeReal":      "https://bere.al/{}",
}

# ─────────────────────────────────────────────────────────────────────────────
#  SETUP BOT
# ─────────────────────────────────────────────────────────────────────────────
intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree

# ─────────────────────────────────────────────────────────────────────────────
#  HEADERS NAVIGATEUR
# ─────────────────────────────────────────────────────────────────────────────
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Origin": "https://reacher-w2dn.onrender.com",
    "Referer": "https://reacher-w2dn.onrender.com/",
}

# ─────────────────────────────────────────────────────────────────────────────
#  APPEL API PRINCIPAL (nom, prénom, email, etc.)
# ─────────────────────────────────────────────────────────────────────────────
async def call_db(**params) -> list[dict]:
    """Cherche dans toutes les bases de données disponibles."""
    results = []

    async def try_source(url: str, p: dict, label: str):
        try:
            async with aiohttp.ClientSession(headers=HEADERS) as s:
                async with s.get(url, params=p, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    print(f"[{label}] {r.status} | {p}")
                    if r.status == 200:
                        data = await r.json(content_type=None)
                        raw = (
                            data.get("data") or
                            data.get("results") or
                            data.get("result") or
                            (data if isinstance(data, list) else [])
                        )
                        print(f"[{label}] {len(raw)} résultats")
                        return raw
        except Exception as e:
            print(f"[{label}] ERREUR: {e}")
        return []

    # Source 1 — reacher-w2dn.onrender.com
    r1 = await try_source(REACHER_URL + "/api/search", params, "Reacher")
    results.extend(r1)

    # Source 2 — fd54a71c.sentinet.nl/bde
    p2 = dict(params)
    if SENTINET_API_KEY:
        p2["api_key"] = SENTINET_API_KEY
    r2 = await try_source(SENTINET_URL, p2, "SentiNet-BDE")
    # dédoublonnage par email
    existing = {e.get("email", "") for e in results}
    for e in r2:
        if e.get("email", "") not in existing:
            results.append(e)
            existing.add(e.get("email", ""))

    # Source 3 — api.sentinet.nl/search (si clé dispo)
    if SENTINET_API_KEY:
        p3 = dict(params)
        p3["api_key"] = SENTINET_API_KEY
        r3 = await try_source(SENTINET2_URL, p3, "SentiNet-API")
        for e in r3:
            if e.get("email", "") not in existing:
                results.append(e)
                existing.add(e.get("email", ""))

    return results


# ─────────────────────────────────────────────────────────────────────────────
#  LOOKUP IP — ipinfo.io
# ─────────────────────────────────────────────────────────────────────────────
async def lookup_ip(ip: str) -> dict | None:
    try:
        params = {}
        if IPINFO_TOKEN:
            params["token"] = IPINFO_TOKEN
        async with aiohttp.ClientSession() as s:
            async with s.get(IPINFO_URL.format(ip=ip), params=params,
                             timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    return await r.json(content_type=None)
    except Exception as e:
        print(f"[IPinfo] ERREUR: {e}")
    return None


# ─────────────────────────────────────────────────────────────────────────────
#  CHECKER RÉSEAUX SOCIAUX
# ─────────────────────────────────────────────────────────────────────────────
async def check_social(session: aiohttp.ClientSession, name: str, url: str) -> tuple[str, bool, str]:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8),
                               allow_redirects=True,
                               headers={"User-Agent": "Mozilla/5.0"}) as r:
            return name, r.status == 200, url
    except:
        return name, False, url

async def search_social(pseudo: str) -> list[dict]:
    """Retourne les résultats comme une liste de dicts pour la pagination."""
    found = []
    not_found = []

    async with aiohttp.ClientSession() as session:
        tasks = [check_social(session, site, url.format(pseudo)) for site, url in SOCIAL_SITES.items()]
        results = await asyncio.gather(*tasks)

    for site, ok, url in results:
        if ok:
            found.append({"plateforme": site, "url": url, "statut": "✅ Trouvé"})
        else:
            not_found.append({"plateforme": site, "url": url, "statut": "❌ Absent"})

    return found + not_found


# ─────────────────────────────────────────────────────────────────────────────
#  FORMATAGE
# ─────────────────────────────────────────────────────────────────────────────
FIELD_ORDER = [
    ("adresse",          "adresse"),
    ("address",          "adresse"),
    ("adresse_ip",       "adresse_ip"),
    ("ip",               "adresse_ip"),
    ("code_postal",      "code_postal"),
    ("zipcode",          "code_postal"),
    ("postal_code",      "code_postal"),
    ("email",            "email"),
    ("hashed_password",  "hashed_password"),
    ("password",         "hashed_password"),
    ("hash",             "hashed_password"),
    ("nom_affichage",    "nom_affichage"),
    ("displayname",      "nom_affichage"),
    ("display_name",     "nom_affichage"),
    ("nom_famille",      "nom_famille"),
    ("nom",              "nom_famille"),
    ("lastname",         "nom_famille"),
    ("last_name",        "nom_famille"),
    ("nom_utilisateur",  "nom_utilisateur"),
    ("username",         "nom_utilisateur"),
    ("pseudo",           "nom_utilisateur"),
    ("pays",             "pays"),
    ("country",          "pays"),
    ("prenom",           "prenom"),
    ("firstname",        "prenom"),
    ("first_name",       "prenom"),
    ("ville",            "ville"),
    ("city",             "ville"),
    ("telephone",        "telephone"),
    ("phone",            "telephone"),
    ("date_naissance",   "date_naissance"),
    ("birthdate",        "date_naissance"),
    ("nir",              "nir"),
    ("secu",             "nir"),
    ("iban",             "iban"),
    ("immat",            "immat"),
    ("vin",              "vin"),
    ("source",           "source"),
    # champs IP spéciaux
    ("plateforme",       "plateforme"),
    ("url",              "url"),
    ("statut",           "statut"),
    ("org",              "organisation"),
    ("hostname",         "hostname"),
    ("region",           "region"),
    ("timezone",         "timezone"),
    ("loc",              "coordonnées"),
]

def format_entry(entry: dict) -> str:
    seen = set()
    lines = []
    known = {k for k, _ in FIELD_ORDER}
    for src_key, display_key in FIELD_ORDER:
        val = entry.get(src_key)
        if val and display_key not in seen:
            seen.add(display_key)
            lines.append(f"{display_key}: {val}")
    for k, v in entry.items():
        if k not in known and v and str(v).strip():
            lines.append(f"{k}: {v}")
    return "\n".join(lines)

def format_all_txt(results: list[dict], search_type: str = "", query: str = "") -> str:
    lines = [
        "=" * 50,
        "       RYZEN SEARCHER — RÉSULTATS",
        "=" * 50,
        f"Recherche : {search_type} → {query}",
        f"Date      : {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        f"Total     : {len(results)} résultat(s)",
        "=" * 50,
        "",
    ]
    for i, entry in enumerate(results, 1):
        lines.append(f"===== RESULT {i} =====")
        lines.append(format_entry(entry))
        lines.append("")
    lines.append("discord.gg/Ryzen")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
#  VIEW PAGINATION
# ─────────────────────────────────────────────────────────────────────────────
class ResultView(ui.View):
    def __init__(self, results: list[dict], search_type: str = "", query: str = ""):
        super().__init__(timeout=300)
        self.results     = results
        self.page        = 0
        self.total       = len(results)
        self.search_type = search_type
        self.query       = query
        self._refresh()

    def _refresh(self):
        self.prev_btn.disabled = (self.page == 0)
        self.next_btn.disabled = (self.page >= self.total - 1)

    def make_embed(self) -> discord.Embed:
        entry = self.results[self.page]
        text  = format_entry(entry)
        embed = discord.Embed(title="Résultat de la recherche", color=ORANGE)
        # Tronquer si trop long pour Discord (max 4096 chars dans description)
        if len(text) > 3900:
            text = text[:3900] + "\n..."
        embed.description = f"```\n{text}\n```"
        embed.set_footer(text=f"Résultat {self.page+1}/{self.total} | discord.gg/Ryzen")
        return embed

    @ui.button(emoji="⬅️", style=discord.ButtonStyle.secondary)
    async def prev_btn(self, interaction: discord.Interaction, button: ui.Button):
        self.page -= 1
        self._refresh()
        await interaction.response.edit_message(embed=self.make_embed(), view=self)

    @ui.button(emoji="📄", style=discord.ButtonStyle.primary)
    async def export_btn(self, interaction: discord.Interaction, button: ui.Button):
        content = format_all_txt(self.results, self.search_type, self.query)
        f = discord.File(fp=io.BytesIO(content.encode("utf-8")), filename="ryzen_results.txt")
        await interaction.response.send_message(
            content="📄 Voici ton export :", file=f, ephemeral=True
        )

    @ui.button(emoji="➡️", style=discord.ButtonStyle.secondary)
    async def next_btn(self, interaction: discord.Interaction, button: ui.Button):
        self.page += 1
        self._refresh()
        await interaction.response.edit_message(embed=self.make_embed(), view=self)


# ─────────────────────────────────────────────────────────────────────────────
#  ENVOI RÉSULTATS
# ─────────────────────────────────────────────────────────────────────────────
async def send_results(interaction: discord.Interaction, results: list[dict],
                       search_type: str = "", query: str = ""):
    if not results:
        embed = discord.Embed(title="Résultat de la recherche", color=ORANGE)
        embed.description = (
            "```\n"
            "Aucun résultat trouvé.\n\n"
            "Conseils :\n"
            "→ Vérifie l'orthographe\n"
            "→ Essaie avec moins de critères\n"
            "→ Essaie un autre type de recherche\n"
            "```"
        )
        embed.set_footer(text="Résultat 0/0 | discord.gg/Ryzen")
        await interaction.followup.send(embed=embed, ephemeral=True)
        return

    view  = ResultView(results, search_type, query)
    embed = view.make_embed()
    await interaction.followup.send(embed=embed, view=view, ephemeral=True)


# ─────────────────────────────────────────────────────────────────────────────
#  MODALS
# ─────────────────────────────────────────────────────────────────────────────
class ModalAvance(ui.Modal, title="Recherche avancée"):
    prenom      = ui.TextInput(label="Prénom",      placeholder="Jean",              required=False)
    nom         = ui.TextInput(label="Nom",         placeholder="Dupont",            required=False)
    email       = ui.TextInput(label="Email",       placeholder="email@example.com", required=False)
    telephone   = ui.TextInput(label="Téléphone",   placeholder="0612345678",        required=False)
    code_postal = ui.TextInput(label="Code postal", placeholder="75000",             required=False)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        params = {}
        if self.prenom.value:      params["prenom"]      = self.prenom.value.strip()
        if self.nom.value:         params["nom"]         = self.nom.value.strip()
        if self.email.value:       params["email"]       = self.email.value.strip()
        if self.telephone.value:   params["telephone"]   = self.telephone.value.strip()
        if self.code_postal.value: params["code_postal"] = self.code_postal.value.strip()
        results = await call_db(**params)
        q = " ".join(f"{k}={v}" for k, v in params.items())
        await send_results(interaction, results, "Recherche avancée", q)


class ModalPrenomNom(ui.Modal, title="Prénom + Nom"):
    prenom = ui.TextInput(label="Prénom", placeholder="Jean")
    nom    = ui.TextInput(label="Nom",    placeholder="Dupont")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(prenom=self.prenom.value.strip(), nom=self.nom.value.strip())
        await send_results(interaction, results, "Prénom + Nom", f"{self.prenom.value} {self.nom.value}")


class ModalNomNaissance(ui.Modal, title="Nom de naissance"):
    nom = ui.TextInput(label="Nom de naissance", placeholder="Dupont")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(nom=self.nom.value.strip())
        await send_results(interaction, results, "Nom de naissance", self.nom.value)


class ModalDateNaissance(ui.Modal, title="Date de naissance"):
    date = ui.TextInput(label="Date (JJ/MM/AAAA ou AAAA)", placeholder="15/04/1985")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(date_naissance=self.date.value.strip())
        await send_results(interaction, results, "Date de naissance", self.date.value)


class ModalSecu(ui.Modal, title="N° Sécurité sociale"):
    nir = ui.TextInput(label="NIR (N° de sécu)", placeholder="1 90 05 75 000 000 00")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(nir=self.nir.value.strip())
        await send_results(interaction, results, "Sécurité sociale", self.nir.value)


class ModalEmail(ui.Modal, title="Email"):
    email = ui.TextInput(label="Adresse email", placeholder="email@example.com")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(email=self.email.value.strip())
        await send_results(interaction, results, "Email", self.email.value)


class ModalTelephone(ui.Modal, title="Téléphone"):
    phone = ui.TextInput(label="Numéro de téléphone", placeholder="0612345678")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(telephone=self.phone.value.strip())
        await send_results(interaction, results, "Téléphone", self.phone.value)


class ModalPseudo(ui.Modal, title="Pseudo / Réseaux sociaux"):
    pseudo = ui.TextInput(label="Pseudo / Username", placeholder="darkwolf99")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        # Cherche dans les DBs ET les réseaux sociaux en parallèle
        db_task     = call_db(pseudo=self.pseudo.value.strip())
        social_task = search_social(self.pseudo.value.strip())
        db_results, social_results = await asyncio.gather(db_task, social_task)

        all_results = db_results + social_results
        await send_results(interaction, all_results, "Pseudo", self.pseudo.value)


class ModalVille(ui.Modal, title="Ville"):
    ville = ui.TextInput(label="Ville", placeholder="PARIS")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(ville=self.ville.value.strip())
        await send_results(interaction, results, "Ville", self.ville.value)


class ModalNomAffichage(ui.Modal, title="Nom d'affichage"):
    nom = ui.TextInput(label="Nom d'affichage / pseudonyme", placeholder="Jean DUPONT")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(nom_affichage=self.nom.value.strip())
        await send_results(interaction, results, "Nom d'affichage", self.nom.value)


class ModalCodePostal(ui.Modal, title="Code Postal"):
    cp = ui.TextInput(label="Code postal", placeholder="75000")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(code_postal=self.cp.value.strip())
        await send_results(interaction, results, "Code postal", self.cp.value)


class ModalPays(ui.Modal, title="Pays"):
    pays = ui.TextInput(label="Pays (code ou nom)", placeholder="FR")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(pays=self.pays.value.strip())
        await send_results(interaction, results, "Pays", self.pays.value)


class ModalAdresse(ui.Modal, title="Adresse"):
    adresse = ui.TextInput(label="Adresse complète", placeholder="1 rue du stade")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(adresse=self.adresse.value.strip())
        await send_results(interaction, results, "Adresse", self.adresse.value)


class ModalIP(ui.Modal, title="Adresse IP"):
    ip = ui.TextInput(label="Adresse IP", placeholder="37.35.206.126")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        ip_val = self.ip.value.strip()

        # IPinfo.io
        info = await lookup_ip(ip_val)
        if info and "bogon" not in info:
            result = {
                "adresse_ip":   ip_val,
                "pays":         info.get("country", ""),
                "ville":        info.get("city", ""),
                "region":       info.get("region", ""),
                "organisation": info.get("org", ""),
                "hostname":     info.get("hostname", ""),
                "timezone":     info.get("timezone", ""),
                "coordonnées":  info.get("loc", ""),
            }
            results = [result]
        else:
            results = []

        # Cherche aussi dans les DBs
        db_res = await call_db(ip=ip_val)
        results.extend(db_res)

        await send_results(interaction, results, "IP", ip_val)


class ModalVehicule(ui.Modal, title="Véhicule"):
    immat = ui.TextInput(label="Immatriculation ou NIV", placeholder="AB-123-CD")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(immat=self.immat.value.strip())
        await send_results(interaction, results, "Véhicule", self.immat.value)


class ModalIBAN(ui.Modal, title="IBAN"):
    iban = ui.TextInput(label="IBAN", placeholder="FR76 3000 6000 0112 3456 7890 189")

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await call_db(iban=self.iban.value.strip())
        await send_results(interaction, results, "IBAN", self.iban.value)


# ─────────────────────────────────────────────────────────────────────────────
#  SELECT MENU (persistant — fix "app ne répond plus")
# ─────────────────────────────────────────────────────────────────────────────
SEARCH_OPTIONS = [
    discord.SelectOption(label="→ Recherche avancée",   description="Toutes les bases de données",        value="avance",         emoji="🔍"),
    discord.SelectOption(label="→ Prénom + Nom",         description="Recherche par prénom + nom",         value="prenom_nom",     emoji="👤"),
    discord.SelectOption(label="→ Nom de naissance",     description="Recherche par nom de naissance",     value="nom_naissance",  emoji="📛"),
    discord.SelectOption(label="→ Date de naissance",    description="Format: JJ/MM/AAAA",                 value="date_naissance", emoji="📅"),
    discord.SelectOption(label="→ N° Sécurité sociale",  description="Recherche par NIR",                  value="secu",           emoji="🏥"),
    discord.SelectOption(label="→ Email",                description="Recherche par email",                value="email",          emoji="📧"),
    discord.SelectOption(label="→ Téléphone",            description="Recherche par téléphone",            value="telephone",      emoji="📞"),
    discord.SelectOption(label="→ Pseudo / Réseaux",     description="Pseudo + 25 réseaux sociaux",        value="pseudo",         emoji="🔖"),
    discord.SelectOption(label="→ Ville",                description="Recherche par ville",                value="ville",          emoji="🏙️"),
    discord.SelectOption(label="→ Nom d'affichage",      description="Recherche par nom affiché",          value="nom_affichage",  emoji="💬"),
    discord.SelectOption(label="→ Code Postal",          description="Recherche par code postal",          value="code_postal",    emoji="📮"),
    discord.SelectOption(label="→ Pays",                 description="Recherche par pays",                 value="pays",           emoji="🌍"),
    discord.SelectOption(label="→ Adresse",              description="Recherche par adresse",              value="adresse",        emoji="📍"),
    discord.SelectOption(label="→ IP",                   description="Géoloc IPinfo + bases de données",   value="ip",             emoji="🌐"),
    discord.SelectOption(label="→ Véhicule",             description="Immatriculation ou NIV",             value="vehicule",       emoji="🚗"),
    discord.SelectOption(label="→ IBAN",                 description="Recherche par IBAN bancaire",        value="iban",           emoji="🏦"),
]

MODAL_MAP = {
    "avance":         ModalAvance,
    "prenom_nom":     ModalPrenomNom,
    "nom_naissance":  ModalNomNaissance,
    "date_naissance": ModalDateNaissance,
    "secu":           ModalSecu,
    "email":          ModalEmail,
    "telephone":      ModalTelephone,
    "pseudo":         ModalPseudo,
    "ville":          ModalVille,
    "nom_affichage":  ModalNomAffichage,
    "code_postal":    ModalCodePostal,
    "pays":           ModalPays,
    "adresse":        ModalAdresse,
    "ip":             ModalIP,
    "vehicule":       ModalVehicule,
    "iban":           ModalIBAN,
}


class SearchSelect(ui.Select):
    def __init__(self):
        super().__init__(
            placeholder="Sélectionne un type de recherche...",
            options=SEARCH_OPTIONS,
            min_values=1,
            max_values=1,
            custom_id="ryzen_search_select",  # ← important pour persistance
        )

    async def callback(self, interaction: discord.Interaction):
        # Répond IMMÉDIATEMENT avec le modal — évite "app ne répond plus"
        modal_cls = MODAL_MAP.get(self.values[0])
        if modal_cls:
            await interaction.response.send_modal(modal_cls())


class SearchView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)  # ← timeout=None = persistant
        self.add_item(SearchSelect())


# ─────────────────────────────────────────────────────────────────────────────
#  COMMANDES SLASH
# ─────────────────────────────────────────────────────────────────────────────
@tree.command(name="search", description="Recherche dans les bases")
async def cmd_search(interaction: discord.Interaction):
    embed = discord.Embed(color=BLACK)
    embed.description = (
        "```\n"
        "══════════════════════════════════════\n"
        "           RYZEN SEARCHER\n"
        "══════════════════════════════════════\n"
        "\n"
        "[+] 16 types disponibles\n"
        "[+] Multi-sources\n"
        "[+] Export .txt\n"
        "```"
    )
    embed.add_field(name="Créateur:", value="@Skayrush", inline=False)
    # Répond IMMÉDIATEMENT — fix "app ne répond plus"
    await interaction.response.send_message(
        embed=embed,
        view=SearchView(),
        ephemeral=True
    )


@tree.command(name="xsint", description="Recherche avancée xsint")
async def cmd_xsint(interaction: discord.Interaction):
    await interaction.response.send_modal(ModalAvance())


# ─────────────────────────────────────────────────────────────────────────────
#  LANCEMENT
# ─────────────────────────────────────────────────────────────────────────────
@bot.event
async def on_ready():
    # Enregistre la view persistante
    bot.add_view(SearchView())
    await tree.sync()
    await bot.change_presence(activity=discord.Activity(
        type=discord.ActivityType.watching,
        name="discord.gg/Ryzen • /search"
    ))
    print("╔══════════════════════════════════════╗")
    print(f"║  ✅  RYZEN BOT connecté               ║")
    print(f"║  👤  {str(bot.user):<32}║")
    print(f"║  🔑  SentiNet : {'✓' if SENTINET_API_KEY else '✗ Sans clé'}                    ║")
    print(f"║  🌐  IPinfo   : {'✓' if IPINFO_TOKEN else '✗ Sans token (limité)'}             ║")
    print("╚══════════════════════════════════════╝")


if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("❌  DISCORD_TOKEN manquant dans .env !")
        exit(1)
    bot.run(DISCORD_TOKEN)
