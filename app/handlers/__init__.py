def register(r):
    from . import admin, pages, comments, search, labels, history, export_pdf, attachments, moderation, media
    for mod in (admin, pages, comments, search, labels, history, export_pdf, attachments, moderation, media):
        mod.register(r)
