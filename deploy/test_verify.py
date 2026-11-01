"""Run with python3 deploy/test_verify.py; no network or Docker daemon needed."""
import copy
import unittest

from verify import check, metadata


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.config = {"services": {"api": {
            "image": "ghcr.io/example/clearcsv-api:v1.2.3",
            "environment": {"APP_VERSION": "v1.2.3"},
            "ports": [{"host_ip": "127.0.0.1", "published": "3000"}],
        }}}

    def test_explicit_image_and_local_health_address(self):
        self.assertEqual(metadata("api", self.config),
                         ("ghcr.io/example/clearcsv-api:v1.2.3", "v1.2.3", "http://127.0.0.1:3000"))
        self.config["services"]["api"]["ports"][0]["host_ip"] = "::1"
        self.assertEqual(metadata("api", self.config)[2], "http://[::1]:3000")

    def test_reject_floating_tag_and_version_mismatch(self):
        for image in ("ghcr.io/example/clearcsv-api:latest", "ghcr.io/example/clearcsv-api:v1.2.4", "example/api:v1.2.3"):
            with self.subTest(image=image):
                config = copy.deepcopy(self.config)
                config["services"]["api"]["image"] = image
                with self.assertRaises(ValueError):
                    metadata("api", config)

    def test_api_requires_ready_and_matching_version(self):
        check("api", "v1.2.3", {"status": "ok", "version": "v1.2.3"})
        for payload in ({"status": "ok", "version": "old"}, {"status": "unavailable", "version": "v1.2.3"}):
            with self.assertRaises(ValueError):
                check("api", "v1.2.3", payload)
        with self.assertRaises(ValueError):
            check("api", "v1.2.3", [])

    def test_frontend_requires_same_origin_enabled_history_and_release(self):
        good = {"appVersion": "v1.2.3", "apiUrl": "", "historyEnabled": True}
        check("frontend", "v1.2.3", good)
        for key, value in (("appVersion", "old"), ("apiUrl", "http://another-host"), ("historyEnabled", False)):
            with self.assertRaises(ValueError):
                check("frontend", "v1.2.3", {**good, key: value})


if __name__ == "__main__":
    unittest.main()
