from django.db import models


class Placeholder(models.Model):
    """
    Placeholder model to keep the app migrations consistent.
    No DB tables are strictly required for the current assessment.
    """

    created_at = models.DateTimeField(auto_now_add=True)

