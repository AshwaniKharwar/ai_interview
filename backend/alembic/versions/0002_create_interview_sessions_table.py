"""create interview sessions table

Revision ID: 0002_create_interview_sessions_table
Revises: 0001_create_users_table
Create Date: 2026-10-18 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_create_interview_sessions_table"
down_revision: Union[str, None] = "0001_create_users_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "interview_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("job_title", sa.String(length=255), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("job_description_raw", sa.Text(), nullable=False),
        sa.Column("parsed_jd_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("resume_file_url", sa.String(length=1024), nullable=True),
        sa.Column("resume_raw_text", sa.Text(), nullable=True),
        sa.Column("parsed_resume_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("gap_analysis_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("difficulty_level", sa.String(length=50), nullable=False, server_default="medium"),
        sa.Column(
            "interviewer_persona",
            sa.String(length=50),
            nullable=False,
            server_default="rigorous_collaborative",
        ),
        sa.Column("blueprint_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("llm_model_used", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="DRAFT"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_interview_sessions_id"), "interview_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_interview_sessions_user_id"), "interview_sessions", ["user_id"], unique=False)
    op.create_index(op.f("ix_interview_sessions_status"), "interview_sessions", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_sessions_status"), table_name="interview_sessions")
    op.drop_index(op.f("ix_interview_sessions_user_id"), table_name="interview_sessions")
    op.drop_index(op.f("ix_interview_sessions_id"), table_name="interview_sessions")
    op.drop_table("interview_sessions")
