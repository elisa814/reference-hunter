# 🚀 Reference Hunter — Guía de Deploy en GitHub Pages

## Lo que ya tenés
✅ Código completo de la app
✅ Login con email/contraseña + Google
✅ Autosave automático en Firebase
✅ Historial de versiones por proyecto
✅ Modo Diseñadores / Modo Cliente
✅ Exportar PDF (print optimizado para Illustrator)
✅ Deploy automático con GitHub Actions

---

## PASO 1 — Crear cuenta GitHub
1. Ir a **github.com** → Sign up
2. Nombre de usuario: algo como `avalon-design-tools` o tu nombre
3. Email y contraseña → Verificar email

---

## PASO 2 — Crear proyecto Firebase (gratuito)

> Firebase es la base de datos + autenticación. El plan gratuito es suficiente.

1. Ir a **console.firebase.google.com**
2. Click → "Agregar proyecto"
3. Nombre: `reference-hunter-avalon` → Continuar (sin Google Analytics por ahora)
4. Una vez creado:

### Activar Authentication:
- Sidebar izquierdo → **Authentication** → Get Started
- Tab **Sign-in method**
- Activar: **Email/Password** → Guardar
- Activar: **Google** → Elegir email de soporte → Guardar

### Activar Firestore:
- Sidebar → **Firestore Database** → Create database
- Elegir **Start in test mode** (después lo securizamos)
- Región: `us-east1` → Enable

### Reglas de seguridad Firestore:
Ir a Firestore → Rules → reemplazar con:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```
→ Publish

### Obtener credenciales:
- Sidebar → Project Settings (⚙️ arriba) → General
- Bajar hasta "Your apps" → Web app (</>)
- Registrar app, nombre: "Reference Hunter"
- Copiar el objeto `firebaseConfig` — vas a necesitar estos valores:
```
apiKey: "AIza..."
authDomain: "tu-proyecto.firebaseapp.com"
projectId: "tu-proyecto-id"
storageBucket: "tu-proyecto.appspot.com"
messagingSenderId: "123456789"
appId: "1:123456789:web:abc..."
```

---

## PASO 3 — Obtener API Key de Anthropic

1. Ir a **console.anthropic.com**
2. API Keys → Create Key
3. Nombre: `reference-hunter-prod`
4. Copiar la key (empieza con `sk-ant-...`)
5. ⚠️ Solo se muestra una vez — guardala

---

## PASO 4 — Subir código a GitHub

### En tu computadora, instalar Git si no lo tenés:
- Windows: **git-scm.com/download/win**
- Mac: ya viene instalado

### Crear el repositorio:
1. En **github.com** → New repository
2. Nombre: `reference-hunter`
3. **Private** (recomendado para proteger las keys en el workflow)
4. No inicializar con README
5. Create repository

### Subir el código:
Abrir terminal en la carpeta del proyecto y ejecutar:

```bash
git init
git add .
git commit -m "Initial commit - Reference Hunter v1.0"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/reference-hunter.git
git push -u origin main
```

---

## PASO 5 — Configurar Secrets en GitHub

En GitHub → tu repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Agregar cada uno:

| Secret name | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | tu apiKey de Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | tu authDomain |
| `VITE_FIREBASE_PROJECT_ID` | tu projectId |
| `VITE_FIREBASE_STORAGE_BUCKET` | tu storageBucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | tu messagingSenderId |
| `VITE_FIREBASE_APP_ID` | tu appId |
| `VITE_ANTHROPIC_API_KEY` | tu sk-ant-... |

---

## PASO 6 — Activar GitHub Pages

1. Repositorio → **Settings** → **Pages**
2. Source: **GitHub Actions**
3. Guardar

---

## PASO 7 — Deploy automático

Al hacer cualquier `git push` al branch `main`, la app se deploya automáticamente.

Para ver el progreso: **Actions** tab en tu repositorio.

Tu URL final será:
```
https://TU-USUARIO.github.io/reference-hunter/
```

---

## PASO 8 — Agregar dominio propio (opcional)

Si querés `references.avalonworld.com.ar`:
1. Settings → Pages → Custom domain
2. Ingresar el dominio
3. En tu proveedor DNS agregar un CNAME record:
   - Host: `references`
   - Value: `TU-USUARIO.github.io`

---

## Actualizar la app en el futuro

Cada vez que hagas cambios:
```bash
git add .
git commit -m "descripción del cambio"
git push
```

GitHub Actions se encarga del deploy automáticamente en ~2 minutos.

---

## Estructura del proyecto
```
reference-hunter/
├── .github/workflows/deploy.yml  ← Deploy automático
├── src/
│   ├── pages/
│   │   ├── Login.jsx             ← Pantalla de login
│   │   ├── Dashboard.jsx         ← Historial de proyectos
│   │   └── Hunter.jsx            ← App principal (form + resultados)
│   ├── utils/
│   │   └── pdfExport.js          ← Generador de PDF
│   ├── contexts/AuthContext.jsx  ← Manejo de sesión
│   ├── firebase.js               ← Configuración Firebase
│   └── App.jsx                   ← Router principal
├── .env.example                  ← Template de variables de entorno
└── package.json
```

---

## Flujo de uso

1. Diseñadora entra → Login
2. Dashboard → historial de todos los clientes ingresados
3. "+ Nuevo Proyecto" → 3 pasos del brief → Generar
4. Autosave automático cada 3 segundos de cambio
5. Toggle **Diseñadores / Cliente** para cambiar la vista
6. 🕐 **Historial** → ver versiones anteriores del mismo cliente
7. **↓ Exportar PDF** → se abre ventana de impresión → Guardar como PDF → Abrir en Illustrator
