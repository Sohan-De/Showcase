# Prophone Béziers — site vitrine + administration

Site 100 % statique (HTML / CSS / JavaScript natif en modules ES). Aucune compilation. Données : Supabase (PostgreSQL + Auth + RLS).

**Thème inspiré du modèle Smartfun** : fond crème, titres bleu marine, boutons orange, cartes arrondies. Polices Baloo 2 et Inter hébergées dans `assets/fonts` (aucune requête vers Google). Les couleurs se changent dans `:root` de `css/base.css`.

## Structure

```
index.html  prices.html  contact.html  mentions-legales.html  confidentialite.html  404.html
admin/index.html  admin/login.html
css/    base.css (tokens) · components.css · pages.css · admin.css
js/     config.js (URL + clé anon) · client.js · api.js · i18n.js · ui.js · hours.js · main.js · home.js · prices.js · contact.js
js/admin/  guard.js · adminApi.js · app.js · prices.js · catalog.js · bulk.js · csv.js · settings.js · messages.js · ui.js · login.js
i18n/   fr.js · en.js        assets/  logo, favicons, og-image
schema.sql  seed.sql         _headers · vercel.json (en-têtes de sécurité / cache)
```

## 1. Configurer Supabase (une seule fois)

1. Projet déjà créé : `https://whrcfwbbntdykvsrljsp.supabase.co` (URL + clé *anon* déjà dans `js/config.js`).
2. **SQL Editor → New query** : collez tout `schema.sql` → *Run*. Puis `seed.sql` → *Run*.
3. **Authentication → Providers → Email** : désactivez **« Allow new users to sign up »** (inscriptions publiques fermées).
4. **Authentication → Users → Add user** : créez le compte du propriétaire (e-mail + mot de passe, cochez *Auto Confirm User*).
5. Autorisez ce compte comme administrateur (SQL Editor) :
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'PROPRIETAIRE@exemple.fr';
   ```
   Seuls les comptes présents dans `admins` peuvent écrire (policies RLS via `is_admin()`), même s'ils sont connectés.
6. Ne mettez **jamais** de clé `service_role` dans ce dossier.

## 2. Tester en local

```bash
npx serve .
```
Ouvrez http://localhost:3000 (site) et http://localhost:3000/admin/login.html (admin).

## 3. Déployer (envoyer le dossier tel quel)

- **Netlify** : *Add new site → Deploy manually* → glissez le dossier. `_headers` est pris en compte.
- **Vercel** : `vercel --prod` depuis le dossier (ou import Git). `vercel.json` ajoute les en-têtes.
- **GitHub Pages** : poussez le dossier, *Settings → Pages* → branche `main` / racine. (`.nojekyll` inclus. Les en-têtes ne s'appliquent pas ; la page 404 suppose le site à la racine du domaine.)

**Avant la mise en ligne**
- Remplacer `https://www.prophone-beziers.fr` (canonical, Open Graph, `sitemap.xml`, `robots.txt`, JSON-LD) par le vrai domaine : *rechercher/remplacer* dans tout le dossier.
- Compléter les `[À compléter : …]` des pages légales (SIRET, forme juridique, hébergeur, médiateur…).
- Dans l'admin → *Boutique* : lien Facebook réel et lien « Laisser un avis Google » (fiche Google Business Profile).
- Si vous changez de domaine d'hébergement des API, adaptez `connect-src` dans `_headers` / `vercel.json`.
- Photos réelles de la boutique : non fournies, le site utilise des illustrations vectorielles. Pour des images, utilisez du WebP, `loading="lazy"` et `width`/`height`.

## 4. Guide du propriétaire (français)

**Se connecter** : allez sur `votresite.fr/admin/login.html`, saisissez votre e-mail et votre mot de passe. Trois onglets : **Tarifs**, **Boutique** (horaires, coordonnées, promo) et **Messages**.

**Page Tarifs (tout sur une seule page)** : onglet **Tarifs**.
1. **Marque** : cliquez sur une marque (ou « Toutes »). Boutons : *+ Ajouter une marque*, *Renommer*, *Masquer sur le site*, *Supprimer la marque*.
2. **Modèle** : cliquez sur un modèle. Boutons : *+ Ajouter un modèle*, *Renommer / image*, *Masquer*, *Supprimer*.
3. **Réparations et prix** : modifiez le **prix** (€) et la **durée** (minutes). Prix **vide** = « Sur devis ». Le curseur **Affiché** montre ou cache la réparation pour ce modèle. *+ Add a repair to this model* ajoute une réparation à CE modèle uniquement (existante ou nouvelle) ; sur chaque ligne : *Edit type*, *Remove from this model*, *Delete everywhere*. Terminez par **Enregistrer** (barre en bas).

*Masquer* cache l'élément sur le site sans rien perdre ; *Supprimer* demande confirmation et efface aussi les prix liés.

**Horaires, téléphone, bandeau promo** : onglet **Boutique**. Le bandeau promo s'affiche en haut de toutes les pages du site.

**Messages** : onglet **Messages** (pastille rouge = non lus). Appeler, répondre par e-mail, marquer comme lu, supprimer.

## Sécurité & vie privée

- Écriture réservée aux comptes listés dans `admins` (RLS). Lecture publique limitée aux données actives. Les visiteurs peuvent seulement *insérer* dans `contact_messages`.
- Anti-spam : champ piège (honeypot), délai minimum, 1 message/minute par navigateur, et limite serveur (10 messages / 10 min) via trigger.
- Tout contenu affiché est inséré en `textContent` (pas d'`innerHTML` sur des données utilisateur).
- Aucun cookie de suivi. La carte Google Maps ne se charge qu'après clic. Les polices sont hébergées sur le site lui-même.
