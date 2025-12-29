from http.server import SimpleHTTPRequestHandler

from edictor.util import (
        DATA, get_distinct, get_columns,
        check, configuration,
        file_type, file_name, file_handler, triples, download,
        update, serve_base, new_id, modifications, alignments,
        cognates, patterns, distances, semantic_filter, semantic_batch, server_page, server_export,
        upload_semantic_file,
        orthography_tokenize, quit
        )

CONF = configuration()


class Handler(SimpleHTTPRequestHandler):
    """
    Modified basic class for handling requests in our local server.
    """

    def do_POST(s):
        """
        Do a POST request.

        Note:

        This GIST gave me the tip on how to proceed with POST data.

        https://gist.github.com/scimad/ae0196afc0bade2ae39d604225084507
        """
        content_length = int(s.headers['Content-Length'])
        post_data_bytes = s.rfile.read(content_length)
        
        ft = file_type(s.path)
        fn = file_name(s.path)

        if ft in DATA:
            file_handler(s, ft, fn)
            return

        fn = file_name(s.path)

        if fn == "/triples/triples.py":
            triples(s, post_data_bytes, "POST", CONF)
        if fn == "/download.py":
            download(s, post_data_bytes)
        if fn == "/check.py":
            check(s)
        if fn == "/triples/update.py":
            update(s, post_data_bytes, "POST", CONF)
        if fn == "/triples/new_id.py":
            new_id(s, post_data_bytes, "POST", CONF)
        if fn == "/triples/modifications.py":
            modifications(s, post_data_bytes, "POST", CONF)
        if fn == "/alignments.py":
            alignments(s, post_data_bytes, "POST")
        if fn == "/cognates.py":
            cognates(s, post_data_bytes, "POST")
        if fn == "/patterns.py":
            patterns(s, post_data_bytes, "POST")
        if fn == "/distances.py":
            distances(s, post_data_bytes, "POST")
        if fn == "/semantic_filter.py":
            semantic_filter(s, post_data_bytes, "POST")
        if fn == "/semantic_batch.py":
            semantic_batch(s, post_data_bytes, "POST")
        if fn == "/upload_semantic.py":
            upload_semantic_file(s, post_data_bytes, s.headers)
        if fn == "/orthography_tokenize.py":
            orthography_tokenize(s, post_data_bytes, "POST")
        if fn == "/server_page.py":
            server_page(s, post_data_bytes, "POST")
        if fn == "/server_export.py":
            server_export(s, post_data_bytes, "POST")
        if fn == "/quit.py":
            quit(s)

    def do_GET(s):
        """
        Do a GET request.
        """
        
        ft = file_type(s.path)
        fn = file_name(s.path)

        if fn == "/":
            serve_base(s, CONF)

        if ft in DATA:
            file_handler(s, ft, fn)
            return

        if fn == "/triples/triples.py":
            triples(s, s.path, "GET", CONF)
        if fn == "/triples/update.py":
            update(s, s.path, "GET", CONF)
        if fn == "/triples/new_id.py":
            new_id(s, s.path, "GET", CONF)
        if fn == "/triples/modifications.py":
            modifications(s, s.path, "GET", CONF)
        if fn == "/semantic_filter.py":
            semantic_filter(s, s.path, "GET")
        if fn == "/semantic_batch.py":
            semantic_batch(s, s.path, "GET")
        if fn == "/server_page.py":
            server_page(s, s.path, "GET")
        if fn == "/server_export.py":
            server_export(s, s.path, "GET")
        if fn == "/quit.py":
            quit(s)
