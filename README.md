# Корпоративная база знаний

Стек: Python 3 (stdlib + psycopg2), PostgreSQL, Apache + mod_wsgi, чистый JS/HTML/CSS.

## Предварительные пакеты

    sudo apt update
    sudo apt install -y python3 python3-venv python3-pip \
        apache2 libapache2-mod-wsgi-py3 \
        postgresql postgresql-contrib build-essential libpq-dev

## PostgreSQL

    sudo -u postgres psql <<'SQL'
    CREATE USER kb WITH PASSWORD 'CHANGE_ME';
    CREATE DATABASE kb OWNER kb;
    \c kb
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    SQL

    sudo -u postgres psql -d kb -f /opt/kb/sql/01_schema.sql
    sudo -u postgres psql -d kb -f /opt/kb/sql/02_seed.sql

## Код

    sudo mkdir -p /opt/kb
    sudo cp -r ./kb/* /opt/kb/
    sudo chown -R www-data:www-data /opt/kb

    python3 -m venv /opt/kb/venv
    sudo /opt/kb/venv/bin/pip install -r /opt/kb/requirements.txt

## Вложения

    sudo mkdir -p /var/lib/kb/attachments
    sudo chown -R www-data:www-data /var/lib/kb

## Apache

    sudo cp /opt/kb/deploy/apache-kb.conf /etc/apache2/sites-available/kb.conf
    sudo a2enmod wsgi rewrite headers
    sudo a2ensite kb
    sudo systemctl restart apache2

## Первый администратор

    cd /opt/kb
    sudo -u www-data /opt/kb/venv/bin/python - <<'PY'
    import sys; sys.path.insert(0, "/opt/kb")
    from app.auth import hash_password
    from app import db
    h, s = hash_password("admin123")
    uid = db.query(
        "INSERT INTO users(login,password_hash,salt,full_name) "
        "VALUES(%s,%s,%s,%s) RETURNING id",
        ("admin", h, s, "Администратор"), one=True,
    )["id"]
    db.execute(
        "INSERT INTO user_roles(user_id, role_id) "
        "SELECT %s, id FROM roles WHERE code='admin'", (uid,),
    )
    print("admin id =", uid)
    PY

Логин: `admin` / пароль: `admin123` (сменить сразу после первого входа).

## Управление

    sudo systemctl reload apache2     # после изменения Python-кода
    sudo tail -f /var/log/apache2/kb-error.log
    sudo systemctl status postgresql

## Что реализовано

- RBAC: гость / читатель / автор / модератор / админ
- Дерево пространств и страниц
- WYSIWYG-редактор (contenteditable + execCommand)
- Собственная подсветка синтаксиса (Python, JS, SQL, HTML, CSS)
- Метки с автокомплитом на чистом JS
- Полнотекстовый поиск (ILIKE + pg_trgm)
- История версий с восстановлением
- Древовидные комментарии с удалением своих
- Вложения до 50 МБ, превью изображений
- PDF-экспорт на чистом Python (портретная ориентация)
- CRM-модерация: очередь, взятие в работу, одобрение/отклонение
- audit_log
- Карта компетенций — заглушка
